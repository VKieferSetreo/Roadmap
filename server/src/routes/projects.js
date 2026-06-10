// Projekt-CRUD + synchrone Analyse. Endpoints dünn, Logik in Engine/Mappern.

import { Router } from "express"
import { runAnalysis } from "../engine/index.js"
import { rowToFinding, rowToProject } from "../map.js"
import { ApiError, asyncHandler, isPlainObject, isUuid } from "../util.js"

// Kopie aus src/types/domain.ts (DEFAULT_TRANSPORT) — typischer Schwertransport.
export const DEFAULT_TRANSPORT = {
  fahrzeugTyp: "Sattelzug mit Tieflader",
  laenge: 24.5,
  breite: 3.0,
  hoehe: 4.2,
  gesamtgewicht: 68,
  achslast: 11.5,
  achsen: 8,
  ladung: "",
}

async function loadProjectRow(db, id) {
  if (!isUuid(id)) return null
  const { rows } = await db.query("SELECT * FROM projects WHERE id = $1", [id])
  return rows[0] ?? null
}

async function loadFindings(db, projectId) {
  const { rows } = await db.query(
    "SELECT * FROM findings WHERE project_id = $1 ORDER BY km ASC",
    [projectId],
  )
  return rows.map(rowToFinding)
}

export function projectsRouter({ db, deps, corridorM }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const { rows } = await db.query("SELECT * FROM projects ORDER BY updated_at DESC")
    const byProject = new Map()
    if (rows.length) {
      const ids = rows.map((p) => p.id)
      const fRes = await db.query(
        "SELECT * FROM findings WHERE project_id = ANY($1::uuid[]) ORDER BY km ASC",
        [ids],
      )
      for (const f of fRes.rows) {
        if (!byProject.has(f.project_id)) byProject.set(f.project_id, [])
        byProject.get(f.project_id).push(rowToFinding(f))
      }
    }
    res.json({ projects: rows.map((p) => rowToProject(p, byProject.get(p.id) ?? [])) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const name = req.body?.name
    if (typeof name !== "string" || !name.trim()) {
      throw new ApiError(400, "name erforderlich")
    }
    const { rows } = await db.query(
      `INSERT INTO projects (name, status, route_input, transport, zeitraum, route_geometry, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name.trim(), "entwurf",
        JSON.stringify({ mode: "startziel", vias: [] }),
        JSON.stringify(DEFAULT_TRANSPORT),
        JSON.stringify({}),
        JSON.stringify([]),
        req.user?.email ?? null,
      ],
    )
    res.status(201).json(rowToProject(rows[0], []))
  }))

  r.get("/:id", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")
    res.json(rowToProject(row, await loadFindings(db, row.id)))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")

    const body = req.body ?? {}
    for (const key of ["route", "transport", "zeitraum"]) {
      if (body[key] !== undefined && !isPlainObject(body[key])) {
        throw new ApiError(400, `${key} muss ein Objekt sein`)
      }
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      throw new ApiError(400, "name darf nicht leer sein")
    }

    // Merge-Patch wie der FE-Store (updateRoute/updateTransport/updateZeitraum)
    const name = body.name !== undefined ? body.name.trim() : row.name
    const route = body.route ? { ...row.route_input, ...body.route } : row.route_input
    const transport = body.transport ? { ...row.transport, ...body.transport } : row.transport
    const zeitraum = body.zeitraum ? { ...row.zeitraum, ...body.zeitraum } : row.zeitraum

    const { rows } = await db.query(
      `UPDATE projects SET name = $2, route_input = $3, transport = $4, zeitraum = $5,
         updated_at = now() WHERE id = $1 RETURNING *`,
      [row.id, name, JSON.stringify(route), JSON.stringify(transport), JSON.stringify(zeitraum)],
    )
    res.json(rowToProject(rows[0], await loadFindings(db, row.id)))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Projekt nicht gefunden")
    const result = await db.query("DELETE FROM projects WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Projekt nicht gefunden")
    res.status(204).end()
  }))

  r.post("/:id/analysis", asyncHandler(async (req, res) => {
    const row = await loadProjectRow(db, req.params.id)
    if (!row) throw new ApiError(404, "Projekt nicht gefunden")

    try {
      await runAnalysis({ db, project: rowToProject(row, []), deps, corridorM })
    } catch (err) {
      if (err instanceof ApiError) throw err
      // Projekt bleibt unverändert (Persistenz ist transaktional)
      throw new ApiError(502, `Analyse fehlgeschlagen: ${err.message}`)
    }
    const fresh = await loadProjectRow(db, row.id)
    res.json(rowToProject(fresh, await loadFindings(db, row.id)))
  }))

  return r
}
