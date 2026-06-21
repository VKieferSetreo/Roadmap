// Projekt-CRUD + synchrone Analyse + Share-Publish/Revoke. Alles strikt auf den
// Request-Tenant (req.ctx.tenant) gescoped — fremde Projekte sind 404, nicht 403
// (keine Existenz-Orakel über Tenant-Grenzen). Endpoints dünn, Logik in Engine/Mappern.

import { randomUUID } from "node:crypto"
import { Router } from "express"
import { createSemaphore } from "../concurrency.js"
import { runAnalysis } from "../engine/index.js"
import { logAnalyticsEvent } from "./analytics.js"
import { downsample } from "../engine/fallback.js"
import { rowToFinding, rowToProject } from "../map.js"
import { createRateLimiter, hashPassword, rowToShareInfo } from "../shares.js"
import { ApiError, asyncHandler, isFiniteNumber, isPlainObject, isUuid } from "../util.js"

// Begrenzte Parallelität für manuelle Auswertungen (In-Process, eine API-Instanz): viele
// gleichzeitige runAnalysis (Schwer-SELECT je Lauf) würden sonst Event-Loop + Heap überlasten
// (OOM-Risiko bei ~100 parallelen Auswertungen). Weitere Läufe warten FIFO auf einen Slot.
// Echte horizontale Skalierung später via DB-Queue (T-173 Vollausbau, nach T-162). Per
// ANALYSIS_CONCURRENCY übersteuerbar.
const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY ?? 4)
const runAnalysisGated = createSemaphore(ANALYSIS_CONCURRENCY)
// T-310: Pro-Nutzer-Eimer VOR dem globalen Semaphore — sonst belegt ein einzelner Nutzer mit
// Analyse-Spam alle Slots und stellt die Warteschlange für alle anderen zu. Default 5/min,
// per ANALYSIS_RATE_MAX tunebar. Im Test aus (die Suite fährt viele Analysen je Identität in
// <60s; createRateLimiter ist separat getestet).
const ANALYSIS_RATE_MAX = Number(process.env.ANALYSIS_RATE_MAX ?? 5)
const ANALYSIS_RATE_OFF = !!process.env.VITEST || process.env.NODE_ENV === "test"
const analysisLimiter = createRateLimiter({ max: ANALYSIS_RATE_MAX, windowMs: 60_000 })

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
      ...(typeof r.source === "string" && r.source ? { source: r.source } : {}),
      ...(r.grob === true ? { grob: true } : {}), // T-480: Luftlinie-Schätzung persistieren
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

// Gültige Ausblend-Gründe (app-seitige Validierung; DB speichert frei als text).
const HIDE_GRUND = new Set([
  "falsche_fahrbahn", "falsche_daten", "nicht_relevant", "dublette", "bereits_erledigt", "sonstiges",
])

/** Setzt hidden/hiddenGrund/hiddenGrundText auf den Findings anhand der hidden_findings-Rows. */
function applyHidden(findings, hiddenRows) {
  if (!hiddenRows?.length) return findings
  const m = new Map(hiddenRows.map((h) => [h.finding_key, h]))
  for (const f of findings) {
    const h = m.get(f.key)
    if (h) {
      f.hidden = true
      f.hiddenGrund = h.grund
      if (h.grund_text != null) f.hiddenGrundText = h.grund_text
    }
  }
  return findings
}

// Defense-in-Depth (T-156): Findings strikt über projects.tenant_id selbst-absichern,
// nicht nur auf den project_id-Caller-Kontext vertrauen.
async function loadFindings(db, projectId, tenantId) {
  const { rows } = await db.query(
    `SELECT f.* FROM findings f
       JOIN projects p ON p.id = f.project_id
     WHERE f.project_id = $1 AND p.tenant_id = $2
     ORDER BY f.km ASC`,
    [projectId, tenantId],
  )
  const { rows: hidden } = await db.query(
    "SELECT finding_key, grund, grund_text FROM hidden_findings WHERE project_id = $1",
    [projectId],
  )
  return applyHidden(rows.map(rowToFinding), hidden)
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
      await loadFindings(db, row.id, req.ctx.tenant.id),
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
      const hRes = await db.query(
        "SELECT project_id, finding_key, grund, grund_text FROM hidden_findings WHERE project_id = ANY($1::uuid[])",
        [ids],
      )
      const hiddenBy = new Map()
      for (const h of hRes.rows) {
        if (!hiddenBy.has(h.project_id)) hiddenBy.set(h.project_id, [])
        hiddenBy.get(h.project_id).push(h)
      }
      for (const [pid, fs] of findingsBy) applyHidden(fs, hiddenBy.get(pid) ?? [])
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
    // archiviert: true setzt den Zeitstempel (idempotent), false stellt wieder her
    const archivedAt =
      body.archiviert === undefined
        ? row.archived_at
        : body.archiviert
          ? (row.archived_at ?? new Date())
          : null

    // folderId: Ordner-Zuordnung (T-177). null = Wurzel; Ordner muss demselben Mandanten gehören.
    let folderId = row.folder_id
    if (body.folderId !== undefined) {
      folderId = body.folderId
      if (folderId != null) {
        if (!isUuid(folderId)) throw new ApiError(400, "folderId ungültig")
        const f = await db.query(
          "SELECT id FROM folders WHERE id = $1 AND tenant_id = $2",
          [folderId, req.ctx.tenant.id],
        )
        if (!f.rows[0]) throw new ApiError(404, "Ordner nicht gefunden")
      }
    }

    // T-466: Optimistic Lock. Schickt der Client seine bekannte version mit, schreibt der UPDATE
    // nur, wenn sie noch aktuell ist — ein veralteter Schreiber (zweiter Disponent) bekommt 409
    // statt den frischeren Stand still zu überschreiben. Alt-Clients ohne version → blinder
    // Overwrite wie bisher (abwärtskompatibel, kein 409-Sturm während des Deploys).
    const expectedVersion = Number.isInteger(body.version) ? body.version : undefined
    const params = [row.id, name, JSON.stringify(routes), JSON.stringify(transport), JSON.stringify(zeitraum), archivedAt, folderId]
    if (expectedVersion !== undefined) params.push(expectedVersion)
    const { rows } = await db.query(
      `UPDATE projects SET name = $2, routes = $3, transport = $4, zeitraum = $5,
         archived_at = $6, folder_id = $7, version = version + 1, updated_at = now()
       WHERE id = $1${expectedVersion !== undefined ? " AND version = $8" : ""} RETURNING *`,
      params,
    )
    if (!rows[0]) throw new ApiError(409, "konflikt-veraltet")
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
    // T-310: Pro-Nutzer-Drossel vor der teuren Auswertung (je Lauf ein Schwer-SELECT).
    const limitKey = req.ctx?.email || req.ip || "anon"
    if (!ANALYSIS_RATE_OFF && !analysisLimiter(limitKey)) {
      throw new ApiError(429, "Zu viele Analysen — bitte kurz warten")
    }
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")

    try {
      await runAnalysisGated(() => runAnalysis({ db, project: rowToProject(row, [], null), corridorM }))
    } catch (err) {
      if (err instanceof ApiError) throw err
      // Projekt bleibt unverändert (Persistenz ist transaktional). Loggen, damit
      // echte Engine-/DB-Fehler in den Prod-Logs sichtbar sind (502 wird sonst nicht geloggt).
      console.error(`[analysis ${req.params.id}] fehlgeschlagen:`, err)
      throw new ApiError(502, `Analyse fehlgeschlagen: ${err.message}`)
    }
    // Manuelle Auswertung fürs Analytics-Tab protokollieren (fire-and-forget, wirft nie).
    void logAnalyticsEvent(db, {
      email: req.ctx?.email, tenantSlug: req.ctx?.tenant?.slug,
      typ: "manual_analysis", meta: { projectId: row.id },
    })
    const fresh = await loadProjectRow(db, row.id, req.ctx.tenant.id)
    res.json(await present(req, fresh))
  }))

  // ── Fund ausblenden / wieder einblenden (pro Projekt, an stabiler finding_key) ──

  r.post("/:id/findings/hide", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    const findingKey = String(req.body?.findingKey ?? "").trim()
    if (!findingKey) throw new ApiError(400, "findingKey erforderlich")
    const grund = String(req.body?.grund ?? "")
    if (!HIDE_GRUND.has(grund)) throw new ApiError(400, "Ungültiger Grund")
    const grundText = req.body?.grundText != null ? String(req.body.grundText).slice(0, 2000) : null
    if (grund === "sonstiges" && (!grundText || grundText.trim().length < 3)) {
      throw new ApiError(400, "Bitte den Grund kurz beschreiben.")
    }
    const obstacleId = isUuid(req.body?.obstacleId) ? req.body.obstacleId : null
    let kontext = req.body?.kontext ?? {}
    if (typeof kontext !== "object" || Array.isArray(kontext) || kontext === null) kontext = {}
    await db.query(
      `INSERT INTO hidden_findings (project_id, finding_key, obstacle_id, grund, grund_text, kontext, hidden_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, finding_key) DO UPDATE SET grund = EXCLUDED.grund,
         grund_text = EXCLUDED.grund_text, kontext = EXCLUDED.kontext, hidden_by = EXCLUDED.hidden_by`,
      [row.id, findingKey, obstacleId, grund, grundText, JSON.stringify(kontext), req.ctx.email ?? null],
    )
    res.json({ ok: true })
  }))

  r.post("/:id/findings/unhide", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id, req.ctx.tenant.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    const findingKey = String(req.body?.findingKey ?? "").trim()
    if (!findingKey) throw new ApiError(400, "findingKey erforderlich")
    await db.query(
      "DELETE FROM hidden_findings WHERE project_id = $1 AND finding_key = $2",
      [row.id, findingKey],
    )
    res.json({ ok: true })
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
