// Einmalige Diagnose (T-747, 18.09.): quantifiziert, wie viel vom Namens-Match-Zweig
// (w.name = n.name) im Churn-Anti-Join durch generische Template-Namen ("Sperrung (NRW)" etc.)
// erzeugt wird statt durch echte Identitaets-Rotation. Vergleicht rotation_neu MIT und OHNE den
// Namens-Zweig. Nur lesend. `node scripts/diagNamensmatchFalschpositiv.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015
const tage = 30
const params = [KATEGORIEN, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH
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
  -- MIT Namens-Zweig (aktueller Stand)
  rotation_mit_name AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND ((w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8) OR w.name = nk.name)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  -- NUR Geo (kein Namens-Zweig)
  rotation_nur_geo AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND (w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  -- NUR ueber Namen gematcht, aber NICHT ueber Geo (der verdaechtige Anteil)
  nur_namensmatch AS (
    SELECT * FROM rotation_mit_name WHERE id NOT IN (SELECT id FROM rotation_nur_geo)
  )
  SELECT
    (SELECT count(*) FROM rotation_mit_name) AS rotation_mit_namenszweig,
    (SELECT count(*) FROM rotation_nur_geo) AS rotation_nur_geo,
    (SELECT count(*) FROM nur_namensmatch) AS nur_ueber_namen_gematcht,
    (SELECT json_agg(t) FROM (
      SELECT quellen_id, name, count(*) AS n FROM nur_namensmatch
      GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 10
    ) t) AS top_verdaechtige_namen`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
