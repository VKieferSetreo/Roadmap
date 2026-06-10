// Hindernis-Datenbank: CRUD + Bulk-Import (JSON-Liste oder GeoJSON-Punkte).
// Schreibende Endpoints erfordern Rolle admin oder roadmap.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { KATEGORIEN } from "../engine/rules.js"
import { rowToObstacle } from "../map.js"
import { ApiError, asyncHandler, isFiniteNumber, isPlainObject, isUuid } from "../util.js"

const LIST_SQL = `SELECT * FROM obstacles
  WHERE ($1::text IS NULL OR kategorie = $1)
    AND ($2::boolean IS NULL OR aktiv = $2)
    AND ($3::text IS NULL OR name ILIKE $3 OR beschreibung ILIKE $3
         OR strassen_ref ILIKE $3 OR zustaendig ILIKE $3)
  ORDER BY created_at DESC`

const INSERT_SQL = `INSERT INTO obstacles (kategorie, name, beschreibung, lat, lng, strassen_ref,
    zustaendig, quelle, attrs, gueltig_von, gueltig_bis, aktiv, demo)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`

/** Normalisiert + validiert ein Obstacle aus Request/Import. → {ok, value|reason} */
export function validateObstacle(input) {
  if (!isPlainObject(input)) return { ok: false, reason: "kein Objekt" }
  if (!KATEGORIEN.includes(input.kategorie)) {
    return { ok: false, reason: `ungültige kategorie: ${String(input.kategorie)}` }
  }
  const lat = input.lat
  const lng = input.lng
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return { ok: false, reason: "lat/lng fehlen oder sind keine Zahlen" }
  }
  if (input.attrs !== undefined && !isPlainObject(input.attrs)) {
    return { ok: false, reason: "attrs muss ein Objekt sein" }
  }
  return {
    ok: true,
    value: {
      kategorie: input.kategorie,
      name: typeof input.name === "string" ? input.name : null,
      beschreibung: typeof input.beschreibung === "string" ? input.beschreibung : null,
      lat,
      lng,
      strassenRef: typeof input.strassenRef === "string" ? input.strassenRef : null,
      zustaendig: typeof input.zustaendig === "string" ? input.zustaendig : null,
      quelle: isPlainObject(input.quelle) ? input.quelle : null,
      attrs: input.attrs ?? {},
      gueltigVon: input.gueltigVon ?? null,
      gueltigBis: input.gueltigBis ?? null,
      aktiv: input.aktiv !== false,
      demo: input.demo === true,
    },
  }
}

const insertParams = (o) => [
  o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef, o.zustaendig,
  o.quelle != null ? JSON.stringify(o.quelle) : null, JSON.stringify(o.attrs),
  o.gueltigVon, o.gueltigBis, o.aktiv, o.demo,
]

/** GeoJSON-FeatureCollection (Punkte) → flache Obstacle-Inputs. */
function geojsonToInputs(body) {
  return (body.features ?? []).map((feat) => {
    if (feat?.geometry?.type !== "Point" || !Array.isArray(feat.geometry.coordinates)) {
      return { _invalid: "kein Punkt-Feature" }
    }
    const [lng, lat] = feat.geometry.coordinates
    return { ...(feat.properties ?? {}), lat, lng }
  })
}

export function obstaclesRouter({ db }) {
  const r = Router()
  const writeGuard = requireRole("admin", "roadmap")

  r.get("/", asyncHandler(async (req, res) => {
    const { kategorie, q, aktiv } = req.query
    const aktivParam = aktiv === "true" ? true : aktiv === "false" ? false : null
    const { rows } = await db.query(LIST_SQL, [
      kategorie || null,
      aktivParam,
      q ? `%${q}%` : null,
    ])
    res.json({ obstacles: rows.map(rowToObstacle) })
  }))

  r.post("/", writeGuard, asyncHandler(async (req, res) => {
    const check = validateObstacle(req.body)
    if (!check.ok) throw new ApiError(400, check.reason)
    const { rows } = await db.query(INSERT_SQL, insertParams(check.value))
    res.status(201).json(rowToObstacle(rows[0]))
  }))

  r.patch("/:id", writeGuard, asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Hindernis nicht gefunden")
    const { rows: existing } = await db.query("SELECT * FROM obstacles WHERE id = $1", [req.params.id])
    if (!existing[0]) throw new ApiError(404, "Hindernis nicht gefunden")

    // Merge auf camelCase-Ebene, dann komplett validieren und zurückschreiben
    const merged = { ...rowToObstacle(existing[0]), ...req.body }
    const check = validateObstacle(merged)
    if (!check.ok) throw new ApiError(400, check.reason)
    const { rows } = await db.query(
      `UPDATE obstacles SET kategorie = $2, name = $3, beschreibung = $4, lat = $5, lng = $6,
         strassen_ref = $7, zustaendig = $8, quelle = $9, attrs = $10, gueltig_von = $11,
         gueltig_bis = $12, aktiv = $13, demo = $14, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...insertParams(check.value)],
    )
    res.json(rowToObstacle(rows[0]))
  }))

  r.delete("/:id", writeGuard, asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Hindernis nicht gefunden")
    const result = await db.query("DELETE FROM obstacles WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Hindernis nicht gefunden")
    res.status(204).end()
  }))

  r.post("/import", writeGuard, asyncHandler(async (req, res) => {
    const body = req.body
    let inputs
    if (isPlainObject(body) && body.type === "FeatureCollection") {
      inputs = geojsonToInputs(body)
    } else if (isPlainObject(body) && Array.isArray(body.obstacles)) {
      inputs = body.obstacles
    } else {
      throw new ApiError(400, "Erwartet {obstacles: [...]} oder GeoJSON-FeatureCollection")
    }

    const valid = []
    const reasons = []
    inputs.forEach((input, index) => {
      if (input?._invalid) {
        reasons.push({ index, reason: input._invalid })
        return
      }
      const check = validateObstacle(input)
      if (check.ok) valid.push(check.value)
      else reasons.push({ index, reason: check.reason })
    })

    await db.tx(async (q) => {
      for (const o of valid) await q.query(INSERT_SQL, insertParams(o))
    })
    res.json({ imported: valid.length, skipped: reasons.length, reasons })
  }))

  return r
}
