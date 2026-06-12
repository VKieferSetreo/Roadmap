// Projekt-CRUD + synchrone Analyse + Share-Publish/Revoke. Alles strikt auf den
// Request-Tenant (req.ctx.tenant) gescoped — fremde Projekte sind 404, nicht 403
// (keine Existenz-Orakel über Tenant-Grenzen). Endpoints dünn, Logik in Engine/Mappern.

import { randomUUID } from "node:crypto"
import { Router } from "express"
import { runAnalysis } from "../engine/index.js"
import { downsample } from "../engine/fallback.js"
import { rowToFinding, rowToProject } from "../map.js"
import { hashPassword, rowToShareInfo } from "../shares.js"
import { ApiError, asyncHandler, isFiniteNumber, isPlainObject, isUuid } from "../util.js"

// DEFAULT_TRANSPORT v2 (Contract: TransportData ohne fahrzeugTyp/ladung/achslast).
export const DEFAULT_TRANSPORT = {
  laenge: 24.5,
  breite: 3.0,
  hoehe: 4.2,
  gesamtgewicht: 68,
  achsen: 8,
  achslasten: [11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5],
}

export const DEFAULT_ROUTE_FARBE = "#87B52D"

const sanePoint = (p) => isPlainObject(p) && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

/** Boundary-Validierung für PATCH {routes} — ersetzt das ganze Array. */
function normalizeRoutes(routes) {
  if (!Array.isArray(routes)) throw new ApiError(400, "routes muss ein Array sein")
  return routes.map((r, i) => {
    if (!isPlainObject(r)) throw new ApiError(400, `routes[${i}] muss ein Objekt sein`)
    if (r.points !== undefined && !Array.isArray(r.points)) {
      throw new ApiError(400, `routes[${i}].points muss ein Array sein`)
    }
    const points = (r.points ?? []).filter(sanePoint).map((p) => ({ lat: p.lat, lng: p.lng }))
    return {
      id: typeof r.id === "string" && r.id.trim() ? r.id : randomUUID(),
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : `Strecke ${i + 1}`,
      ...(typeof r.fileName === "string" && r.fileName ? { fileName: r.fileName } : {}),
      points: downsample(points),
      farbe: typeof r.farbe === "string" && r.farbe ? r.farbe : DEFAULT_ROUTE_FARBE,
    }
  })
}

async function loadProjectRow(db, id, tenantId) {
  if (!isUuid(id)) return null
  const { rows } = await db.query(
    "SELECT * FROM projects WHERE id = $1 AND tenant_id = $2",
    [id, tenantId],
  )
  return rows[0] ?? null
}

async function loadFindings(db, projectId) {
  const { rows } = await db.query(
    "SELECT * FROM findings WHERE project_id = $1 ORDER BY km ASC",
    [projectId],
  )
  return rows.map(rowToFinding)
}

async function loadShare(db, projectId) {
  const { rows } = await db.query(
    "SELECT * FROM shares WHERE project_id = $1 AND revoked_at IS NULL",
    [projectId],
  )
  return rows[0] ?? null
}

export function projectsRouter({ db, corridorM, shareBaseUrl }) {
  const r = Router()

  /** Einzelnes Projekt in v2-Shape (Findings + eingebettetes share) auflösen. */
  async function present(req, row) {
    return rowToProject(
      row,
      await loadFindings(db, row.id),
      rowToShareInfo(await loadShare(db, row.id), shareBaseUrl, req.ctx.tenant.slug),
    )
  }

  r.get("/", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT * FROM projects WHERE tenant_id = $1 ORDER BY updated_at DESC",
      [req.ctx.tenant.id],
    )
    const findingsBy = new Map()
    const sharesBy = new Map()
    if (rows.length) {
      const ids = rows.map((p) => p.id)
      const fRes = await db.query(
        "SELECT * FROM findings WHERE project_id = ANY($1::uuid[]) ORDER BY km ASC",
        [ids],
      )
      for (const f of fRes.rows) {
        if (!findingsBy.has(f.project_id)) findingsBy.set(f.project_id, [])
        findingsBy.get(f.project_id).push(rowToFinding(f))
      }
      const sRes = await db.query(
        "SELECT * FROM shares WHERE project_id = ANY($1::uuid[]) AND revoked_at IS NULL",
        [ids],
      )
      for (const s of sRes.rows) sharesBy.set(s.project_id, s)
    }
    res.json({
      projects: rows.map((p) =>
        rowToProject(
          p,
          findingsBy.get(p.id) ?? [],
          rowToShareInfo(sharesBy.get(p.id) ?? null, shareBaseUrl, req.ctx.tenant.slug),
        ),
      ),
    })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const name = req.body?.name
    if (typeof name !== "string" || !name.trim()) {
      throw new ApiError(400, "name erforderlich")
    }
    const { rows } = await db.query(
      `INSERT INTO projects (name, status, tenant_id, routes, transport, zeitraum, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name.trim(), "entwurf", req.ctx.tenant.id,
        JSON.stringify([]),
        JSON.stringify(DEFAULT_TRANSPORT),
        JSON.stringify({}),
        req.ctx.email ?? null,
      ],
    )
    res.status(201).json(rowToProject(rows[0], [], null))
  }))

  r.get("/:id", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    res.json(await present(req, row))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")

    const body = req.body ?? {}
    for (const key of ["transport", "zeitraum"]) {
      if (body[key] !== undefined && !isPlainObject(body[key])) {
        throw new ApiError(400, `${key} muss ein Objekt sein`)
      }
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      throw new ApiError(400, "name darf nicht leer sein")
    }

    // transport/zeitraum: Merge-Patch wie der FE-Store; routes: ersetzt das ganze Array
    const name = body.name !== undefined ? body.name.trim() : row.name
    const routes = body.routes !== undefined ? normalizeRoutes(body.routes) : row.routes
    const transport = body.transport ? { ...row.transport, ...body.transport } : row.transport
    const zeitraum = body.zeitraum ? { ...row.zeitraum, ...body.zeitraum } : row.zeitraum

    const { rows } = await db.query(
      `UPDATE projects SET name = $2, routes = $3, transport = $4, zeitraum = $5,
         updated_at = now() WHERE id = $1 RETURNING *`,
      [row.id, name, JSON.stringify(routes), JSON.stringify(transport), JSON.stringify(zeitraum)],
    )
    res.json(await present(req, rows[0]))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Projekt nicht gefunden")
    const result = await db.query(
      "DELETE FROM projects WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.ctx.tenant.id],
    )
    if (result.rowCount === 0) throw new ApiError(404, "Projekt nicht gefunden")
    res.status(204).end()
  }))

  r.post("/:id/analysis", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")

    try {
      await runAnalysis({ db, project: rowToProject(row, [], null), corridorM })
    } catch (err) {
      if (err instanceof ApiError) throw err
      // Projekt bleibt unverändert (Persistenz ist transaktional)
      throw new ApiError(502, `Analyse fehlgeschlagen: ${err.message}`)
    }
    const fresh = await loadProjectRow(db, row.id, req.ctx.tenant.id)
    res.json(await present(req, fresh))
  }))

  // ── Share-Links ─────────────────────────────────────────────────────────────

  /** Publish (oder Re-Publish: ersetzt PW, reaktiviert revoked). */
  r.post("/:id/share", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    const password = req.body?.password
    if (password !== undefined && (typeof password !== "string" || !password)) {
      throw new ApiError(400, "password muss ein nicht-leerer String sein")
    }
    const pwHash = password ? await hashPassword(password) : null
    const { rows } = await db.query(
      `INSERT INTO shares (project_id, tenant_id, pw_hash, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash,
         created_by = EXCLUDED.created_by, revoked_at = NULL RETURNING *`,
      [row.id, req.ctx.tenant.id, pwHash, req.ctx.email ?? null],
    )
    res.status(201).json(rowToShareInfo(rows[0], shareBaseUrl, req.ctx.tenant.slug))
  }))

  /** Revoke: Link wird ungültig (revoked_at), Re-POST reaktiviert. */
  r.delete("/:id/share", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    const result = await db.query(
      "UPDATE shares SET revoked_at = now() WHERE project_id = $1 AND revoked_at IS NULL",
      [row.id],
    )
    if (result.rowCount === 0) throw new ApiError(404, "Kein aktiver Share vorhanden")
    res.status(204).end()
  }))

  return r
}
