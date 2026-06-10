// Projektübergreifende Fund-Suche (für die "Funde"-Ansicht des Frontends).

import { Router } from "express"
import { rowToFinding } from "../map.js"
import { asyncHandler } from "../util.js"

// Statisches SQL mit nullable Filtern — bewusst kein dynamischer Query-Builder.
const SEARCH_SQL = `SELECT f.*, p.name AS projekt_name FROM findings f
  JOIN projects p ON p.id = f.project_id
  WHERE ($1::text IS NULL OR f.kategorie = $1)
    AND ($2::text IS NULL OR f.severity = $2)
    AND ($3::text IS NULL OR f.titel ILIKE $3 OR f.beschreibung ILIKE $3
         OR f.strassen_ref ILIKE $3 OR p.name ILIKE $3)
  ORDER BY f.km ASC`

export function findingsRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const { q, kategorie, severity } = req.query
    const { rows } = await db.query(SEARCH_SQL, [
      kategorie || null,
      severity || null,
      q ? `%${q}%` : null,
    ])
    res.json({
      findings: rows.map((row) => ({
        ...rowToFinding(row),
        projektId: row.project_id,
        projektName: row.projekt_name,
      })),
    })
  }))

  return r
}
