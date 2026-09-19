// Einmalige Diagnose (T-748, 19.09., Max: "weiter nach sowas suchen"): generischer Scan ueber
// ALLE Quellen-Paare (nicht nur Autobahn GmbH) auf geografisch nahe + zeitlich ueberlappende
// Zeilen derselben Kategorie in ZWEI verschiedenen Quellen — Kandidaten fuer weitere "gleicher
// Herausgeber, mehrere Feeds"-Familien wie 0001/0145/0152. Kein strassen_ref-Filter (staedtische
// Strassen haben oft keinen), daher STRENGERE Geo-Toleranz (~300m) als bei der Autobahn-Diagnose,
// um in dichten Staedten keine Zufallstreffer zu erzeugen. Nur lesend.
// `node scripts/diagAllgemeineQuellenDubletten.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const tage = 30
const GEO_LAT = 0.003 // ~300m, wie der Importer-Fuzzy-Match
const GEO_LNG = 0.0045
const params = [KATEGORIEN, tage, GEO_LAT, GEO_LNG]

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH kandidaten AS (
    SELECT o.id, o.quellen_id, o.kategorie, o.name, o.lat, o.lng, o.gueltig_von, o.gueltig_bis
    FROM obstacles o
    WHERE o.demo = false AND o.kategorie = ANY($1) AND o.aktiv = true
      AND o.created_at >= current_date - $2::int * interval '1 day'
  ),
  paare AS (
    SELECT a.quellen_id AS a_quelle, b.quellen_id AS b_quelle, a.id AS a_id, b.id AS b_id
    FROM kandidaten a
    JOIN kandidaten b ON a.id < b.id
      AND a.quellen_id <> b.quellen_id
      AND a.kategorie = b.kategorie
      AND a.lat BETWEEN b.lat - $3::float8 AND b.lat + $3::float8
      AND a.lng BETWEEN b.lng - $4::float8 AND b.lng + $4::float8
      AND (
        (a.gueltig_von IS NULL OR b.gueltig_bis IS NULL OR a.gueltig_von <= b.gueltig_bis) AND
        (b.gueltig_von IS NULL OR a.gueltig_bis IS NULL OR b.gueltig_von <= a.gueltig_bis)
      )
  )
  SELECT
    (SELECT count(*) FROM kandidaten) AS kandidaten_gesamt,
    (SELECT json_agg(t) FROM (
      SELECT LEAST(a_quelle, b_quelle) AS q1, GREATEST(a_quelle, b_quelle) AS q2, count(*) AS n
      FROM paare GROUP BY 1, 2 HAVING count(*) >= 20 ORDER BY count(*) DESC LIMIT 25
    ) t) AS quellenpaare_ab_20`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
