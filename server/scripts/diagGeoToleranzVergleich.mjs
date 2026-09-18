// Einmalige Diagnose (T-747, 18.09.): rotation_nur_geo=32.677 (fast alles) trotz Namens-Zweig
// ausgeschlossen zeigt, dass die GROSSZUEGIGE Geo-Toleranz (~1,1km/45 Tage) selbst der Treiber
// ist, nicht der Namens-Zweig. Testet EINE gezielte Alternative: Importer-Fuzzy-Toleranz (~300m),
// ohne Namens-Zweig. Ein Query-Aufruf mit beiden Varianten als CTEs (kein zweiter Node-Start).
// Nur lesend. `node scripts/diagGeoToleranzVergleich.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const tage = 30
const fenster = 45
// $1 kategorien, $2 tage, $3/$4 aktuelle Toleranz (lat/lng), $5 fenster, $6/$7 300m-Toleranz
const params = [KATEGORIEN, tage, 0.01, 0.015, fenster, 0.003, 0.0045]

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
  rotation_aktuell AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND ((w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8) OR w.name = nk.name)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  rotation_300m AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND (w.lat BETWEEN nk.lat - $6::float8 AND nk.lat + $6::float8 AND w.lng BETWEEN nk.lng - $7::float8 AND nk.lng + $7::float8)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
  )
  SELECT
    (SELECT count(*) FROM neu_kandidaten) AS kandidaten,
    (SELECT count(*) FROM rotation_aktuell) AS rotation_aktuell,
    (SELECT count(*) FROM rotation_300m) AS rotation_300m`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
