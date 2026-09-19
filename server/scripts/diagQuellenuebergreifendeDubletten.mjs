// Einmalige Diagnose (T-748, 19.09.): die aktuelle Vorgangs-Zusammenfassung gruppiert NUR
// innerhalb derselben quellen_id (DISTINCT ON quellen_id, kategorie, basisname). Meldet dieselbe
// reale Autobahn-Baustelle sowohl 0145 (BAB AkD/Autobahn GmbH) als auch eine Landes-/Regional-
// quelle, die ebenfalls Autobahn-Abschnitte fuehrt, zaehlt sie aktuell doppelt. Prueft, wie oft
// das fuer die aktuellen "neu"-Kandidaten (Autobahn, 30 Tage) vorkommt: gleiche strassen_ref,
// geografisch nah, zeitlich ueberlappend, aber ANDERE quelle. Nur lesend.
// `node scripts/diagQuellenuebergreifendeDubletten.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const tage = 30
const GEO_LAT = 0.01 // ~1,1 km, gleiche Toleranz wie der bestehende Churn-Match
const GEO_LNG = 0.015
const params = [KATEGORIEN, tage, GEO_LAT, GEO_LNG]

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH neu_kandidaten AS (
    SELECT * FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.strassen_ref ~* '^A[0-9]'
  ),
  paare AS (
    SELECT a.id AS a_id, a.quellen_id AS a_quelle, a.name AS a_name, a.strassen_ref AS a_strasse,
           b.id AS b_id, b.quellen_id AS b_quelle, b.name AS b_name
    FROM neu_kandidaten a
    JOIN neu_kandidaten b ON a.id < b.id
      AND a.quellen_id <> b.quellen_id
      AND a.strassen_ref = b.strassen_ref
      AND a.lat BETWEEN b.lat - $3::float8 AND b.lat + $3::float8
      AND a.lng BETWEEN b.lng - $4::float8 AND b.lng + $4::float8
      AND (
        (a.gueltig_von IS NULL OR b.gueltig_bis IS NULL OR a.gueltig_von <= b.gueltig_bis) AND
        (b.gueltig_von IS NULL OR a.gueltig_bis IS NULL OR b.gueltig_von <= a.gueltig_bis)
      )
  )
  SELECT
    (SELECT count(*) FROM neu_kandidaten) AS autobahn_kandidaten,
    (SELECT count(DISTINCT a_quelle || '-' || b_quelle) FROM paare) AS beteiligte_quellenpaare,
    (SELECT count(*) FROM paare) AS ueberlappende_paare,
    (SELECT count(DISTINCT x) FROM (SELECT a_id AS x FROM paare UNION SELECT b_id FROM paare) t) AS betroffene_zeilen,
    (SELECT json_agg(t) FROM (
      SELECT a_quelle, b_quelle, count(*) AS n FROM paare GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 10
    ) t) AS top_quellenpaare,
    (SELECT json_agg(t) FROM (
      SELECT a_name, b_name, a_quelle, b_quelle FROM paare LIMIT 5
    ) t) AS beispiele`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
