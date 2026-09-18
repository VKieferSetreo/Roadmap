// Einmalige Verifikation (T-747-Nachbesserung, 18.09.): misst Laufzeit + Ergebnis des neuen
// Anti-Join-Filters in routes/veraenderungen.js gegen Prod, BEVOR das Frontend live geht.
// Nur lesend. Läuft im api-Container: `node scripts/diagChurnFilterCheck.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { FUZZY_LAT, FUZZY_LNG } from "/app/src/worker/importer.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const params = [KATEGORIEN, 30, FUZZY_LAT, FUZZY_LNG, CHURN_FENSTER_TAGE]

const t0 = Date.now()
const { rows } = await db.query(`
  WITH echte_neu AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM obstacles w
        WHERE w.quellen_id = n.quellen_id AND w.kategorie = n.kategorie AND w.aktiv = false
          AND w.id <> n.id
          AND w.lat BETWEEN n.lat - $3::float8 AND n.lat + $3::float8
          AND w.lng BETWEEN n.lng - $4::float8 AND n.lng + $4::float8
          AND w.updated_at BETWEEN n.created_at - ($5::int * interval '1 day')
                                AND n.created_at + ($5::int * interval '1 day')
      )
  ),
  echte_weg AS (
    SELECT w.* FROM obstacles w
    WHERE w.demo = false AND w.kategorie = ANY($1) AND w.aktiv = false
      AND w.updated_at >= current_date - $2::int * interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM obstacles n
        WHERE n.quellen_id = w.quellen_id AND n.kategorie = w.kategorie
          AND n.id <> w.id
          AND n.lat BETWEEN w.lat - $3::float8 AND w.lat + $3::float8
          AND n.lng BETWEEN w.lng - $4::float8 AND w.lng + $4::float8
          AND n.created_at BETWEEN w.updated_at - ($5::int * interval '1 day')
                                AND w.updated_at + ($5::int * interval '1 day')
      )
  )
  SELECT
    (SELECT count(*) FROM echte_neu) AS echte_neu,
    (SELECT count(*) FROM echte_weg) AS echte_weggefallen
`, params)
const ms = Date.now() - t0

console.log(`Dauer: ${ms} ms`)
console.log(JSON.stringify(rows[0]))

// Rohzahlen zum Vergleich (aus dem alten Diagnose-Lauf bekannt: 40.702 neu / 41.142 weggefallen
// nur baustelle+sperrung — hier ALLE Kategorien, also roh etwas höher erwartet).
const roh = await db.query(`
  SELECT
    (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
       AND created_at >= current_date - $2::int * interval '1 day') AS roh_neu,
    (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND aktiv=false
       AND updated_at >= current_date - $2::int * interval '1 day') AS roh_weggefallen
`, [KATEGORIEN, 30])
console.log(JSON.stringify(roh.rows[0]))

process.exit(0)
