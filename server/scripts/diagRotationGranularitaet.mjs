// Einmalige Diagnose (T-747, 18.09.): prueft Max' Verdacht, dass rotation_neu=35.137 dieselben
// realen Vorgaenge mehrfach zaehlt (taegliche externe_id-Neuvergabe derselben Baustelle rotiert
// innerhalb des 30-Tage-Fensters mehrfach). Nur lesend. `node scripts/diagRotationGranularitaet.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015
const tage = 30
const params = [KATEGORIEN, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]
const CHURN_CTES = `
  etablierte_quelle AS (
    SELECT quellen_id FROM obstacles GROUP BY quellen_id
    HAVING min(created_at) < current_date - $2::int * interval '1 day'
  ),
  neu_kandidaten AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.quellen_id IN (SELECT quellen_id FROM etablierte_quelle)
  ),
  rotation_neu AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND ((w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8) OR w.name = nk.name)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  vorgang_rotation AS (
    SELECT DISTINCT ON (quellen_id, kategorie, basisname) * FROM (
      SELECT rn.*, regexp_replace(coalesce(rn.name, rn.id::text),
        '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname
      FROM rotation_neu rn
    ) x ORDER BY quellen_id, kategorie, basisname, created_at ASC
  )
`

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH ${CHURN_CTES}
   SELECT
     (SELECT count(*) FROM rotation_neu) AS rotation_neu_zeilen,
     (SELECT count(*) FROM vorgang_rotation) AS rotation_vorgaenge,
     (SELECT json_agg(t) FROM (
        SELECT quellen_id, count(*) AS zeilen, count(DISTINCT regexp_replace(coalesce(name, id::text),
          '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i')) AS vorgaenge
        FROM rotation_neu GROUP BY quellen_id ORDER BY count(*) DESC LIMIT 10
     ) t) AS top_quellen,
     (SELECT json_agg(t) FROM (
        SELECT regexp_replace(coalesce(name, id::text),
          '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname,
          quellen_id, count(*) AS n
        FROM rotation_neu GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 8
     ) t) AS groesste_ketten`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
