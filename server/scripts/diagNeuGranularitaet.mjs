// Einmalige Diagnose (T-747, 18.09.): Max haelt 3.403 "neue" Autobahn-Baustellen/Sperrungen in
// 30 Tagen fuer absurd (Erwartung: Groessenordnung ~100-300). Prueft, ob "neu" DB-Zeilen statt
// reale Ereignisse zaehlt — ob ein einzelner Vorgang als viele raeumlich getrennte Segmente
// (dedupeObstacles gruppiert nur auf ~100m) mehrfach als "neu" durchgeht.
import { createDefaultDb } from "/app/src/db.js"
const db = createDefaultDb()

console.log("=== Quelle 0001 (Autobahn): 'neu' (30 Tage, kein Anti-Join) je Name, Top 20 ===")
console.log(JSON.stringify((await db.query(`
  SELECT name, count(*) AS n, min(created_at) AS erste, max(created_at) AS letzte,
    count(DISTINCT created_at::date) AS tage_verteilt
  FROM obstacles WHERE demo=false AND quellen_id='0001' AND kategorie IN ('baustelle','sperrung')
    AND created_at >= now() - interval '30 days'
  GROUP BY name ORDER BY n DESC LIMIT 20
`)).rows))

console.log("=== Verteilung: wie viele DISTINCT (name) Gruppen insgesamt vs. Zeilen insgesamt? ===")
console.log(JSON.stringify((await db.query(`
  SELECT count(*) AS zeilen, count(DISTINCT name) AS distinct_namen
  FROM obstacles WHERE demo=false AND quellen_id='0001' AND kategorie IN ('baustelle','sperrung')
    AND created_at >= now() - interval '30 days'
`)).rows))

console.log("=== Beispiel-Name mit den meisten Zeilen: alle Zeilen (lat/lng/created_at/fach_id) ===")
const top = (await db.query(`
  SELECT name, count(*) AS n FROM obstacles WHERE demo=false AND quellen_id='0001'
    AND kategorie IN ('baustelle','sperrung') AND created_at >= now() - interval '30 days'
  GROUP BY name ORDER BY n DESC LIMIT 1
`)).rows[0]
console.log("Top-Name:", top)
if (top) {
  console.log(JSON.stringify((await db.query(`
    SELECT lat, lng, created_at, fach_id, externe_id FROM obstacles
    WHERE demo=false AND quellen_id='0001' AND name=$1 AND created_at >= now() - interval '30 days'
    ORDER BY created_at LIMIT 15
  `, [top.name])).rows))
}

console.log("=== Namen ohne Zahlensuffix (Basis-Name via Regex-Strip) — Gruppen vs Zeilen ===")
console.log(JSON.stringify((await db.query(`
  SELECT count(*) AS zeilen, count(DISTINCT basisname) AS distinct_basisnamen FROM (
    SELECT regexp_replace(name, '\\s*-?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*\\d+\\s*$', '', 'i') AS basisname
    FROM obstacles WHERE demo=false AND quellen_id='0001' AND kategorie IN ('baustelle','sperrung')
      AND created_at >= now() - interval '30 days'
  ) x
`)).rows))

process.exit(0)
