// Einmalige Diagnose (T-747-Erweiterung, 18.09.): strassen_ref-Formate für die geplante
// Straßenklassen-Aufschlüsselung (Autobahn/Bundes-/Landes-/Kreisstraße) sichten.
// Nur lesend. Läuft im api-Container: `node scripts/diagStrassenklasse.mjs`.
import { createDefaultDb } from "/app/src/db.js"

const db = createDefaultDb()
console.log("=== Top-25 strassen_ref-Werte ===")
console.log(JSON.stringify((await db.query(
  `SELECT strassen_ref, count(*) AS n FROM obstacles WHERE demo=false AND strassen_ref IS NOT NULL
   GROUP BY 1 ORDER BY 2 DESC LIMIT 25`,
)).rows))

console.log("=== Verteilung nach erstem Buchstaben (grob) ===")
console.log(JSON.stringify((await db.query(
  `SELECT upper(left(trim(strassen_ref), 1)) AS erstes_zeichen, count(*) AS n
   FROM obstacles WHERE demo=false AND strassen_ref IS NOT NULL AND kategorie IN ('baustelle','sperrung')
   GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
)).rows))

console.log("=== ohne strassen_ref, kategorie baustelle/sperrung ===")
console.log(JSON.stringify((await db.query(
  `SELECT count(*) AS n FROM obstacles WHERE demo=false AND strassen_ref IS NULL AND kategorie IN ('baustelle','sperrung')`,
)).rows))

console.log("=== Beispiele mit unklarem Muster (nicht A/B/L/K am Anfang) ===")
console.log(JSON.stringify((await db.query(
  `SELECT DISTINCT strassen_ref FROM obstacles WHERE demo=false AND kategorie IN ('baustelle','sperrung')
   AND strassen_ref IS NOT NULL AND strassen_ref !~ '^[ABLK]'
   LIMIT 20`,
)).rows))

process.exit(0)
