// Projektübergreifende Fund-Suche (für die "Funde"-Ansicht des Frontends).

import { Router } from "express"
import { rowToFinding } from "../map.js"
import { asyncHandler } from "../util.js"

// Statisches SQL mit nullable Filtern — bewusst kein dynamischer Query-Builder.
// v2: strikt auf den Request-Tenant gescoped ($4).
// T-343: NICHT f.* — der geom-jsonb-Blob (Strecken-Geometrie) ist in der Such-LISTE ungenutzt
// (kein Karten-Render) und blähte die Antwort auf. Explizite Spalten ohne geom.
const SEARCH_SQL = `SELECT f.id, f.project_id, f.obstacle_id, f.kategorie, f.severity, f.titel,
    f.beschreibung, f.lat, f.lng, f.km, f.detail, f.strassen_ref, f.gueltig_von, f.gueltig_bis,
    f.quelle, f.zustaendig, f.route_id, f.route_name, p.name AS projekt_name
  FROM findings f
  JOIN projects p ON p.id = f.project_id
  WHERE ($1::text IS NULL OR f.kategorie = $1)
    AND ($2::text IS NULL OR f.severity = $2)
    AND ($3::text IS NULL OR f.titel ILIKE $3 OR f.beschreibung ILIKE $3
         OR f.strassen_ref ILIKE $3 OR p.name ILIKE $3)
    AND p.tenant_id = $4
  ORDER BY f.km ASC
  LIMIT 500` // T-405: harte Obergrenze gegen unbounded Response (Suche, kein Karten-Render)

export function findingsRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const { q, kategorie, severity } = req.query
    const { rows } = await db.query(SEARCH_SQL, [
      kategorie || null,
      severity || null,
      q ? `%${q}%` : null,
      req.ctx.tenant.id,
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
