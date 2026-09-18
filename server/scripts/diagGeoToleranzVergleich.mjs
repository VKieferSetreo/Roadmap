// Einmalige Diagnose (T-747, 18.09.): rotation_nur_geo=32.677 (fast alles) trotz Namens-Zweig
// ausgeschlossen zeigt, dass die GROSSZUEGIGE Geo-Toleranz (~1,1km/45 Tage) selbst der Treiber
// ist, nicht der Namens-Zweig. Vergleicht die aktuelle Toleranz gegen die des Importer-Fuzzy-
// Match (~300m, bereits an anderer Stelle im Code als "gleiches reales Objekt" akzeptiert) bei
// verschiedenen Zeitfenstern. Nur lesend. `node scripts/diagGeoToleranzVergleich.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const tage = 30
const varianten = [
  { label: "aktuell: geo=1.1km, fenster=45d, +name", lat: 0.01, lng: 0.015, fenster: 45, mitName: true },
  { label: "geo=1.1km, fenster=45d, ohne Name", lat: 0.01, lng: 0.015, fenster: 45, mitName: false },
  { label: "geo=300m (Importer-Toleranz), fenster=45d, ohne Name", lat: 0.003, lng: 0.0045, fenster: 45, mitName: false },
  { label: "geo=300m, fenster=14d, ohne Name", lat: 0.003, lng: 0.0045, fenster: 14, mitName: false },
  { label: "geo=300m, fenster=45d, +name", lat: 0.003, lng: 0.0045, fenster: 45, mitName: true },
]

for (const v of varianten) {
  const params = [KATEGORIEN, tage, v.lat, v.lng, v.fenster]
  const namePred = v.mitName ? "OR w.name = nk.name" : ""
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
    rotation AS (
      SELECT nk.* FROM neu_kandidaten nk
      WHERE EXISTS (
        SELECT 1 FROM obstacles w
        WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
          AND ((w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8) ${namePred})
          AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
      )
    )
    SELECT
      (SELECT count(*) FROM neu_kandidaten) AS kandidaten,
      (SELECT count(*) FROM rotation) AS rotation,
      (SELECT count(*) FROM neu_kandidaten) - (SELECT count(*) FROM rotation) AS echte_neu`,
    params,
  )
  console.log(`${v.label}: rotation=${row.rotation} echte_neu=${row.echte_neu} (${Date.now() - t0}ms)`)
}
process.exit(0)
