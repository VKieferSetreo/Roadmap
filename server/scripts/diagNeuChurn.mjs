// Einmalige Diagnose (T-747-Kritikpunkt, Max 18.09.): "neu" bei Baustellen/Sperrungen war
// absurd hoch (40.702/30 Tage). Prüft, ob das echte neue Einträge sind oder Churn — dieselbe
// Stelle taucht unter neuer externe_id wieder auf (Reconcile deaktiviert die alte Zeile,
// Fuzzy-Match des Importers greift nicht, es entsteht ein zweiter INSERT statt eines UPDATE).
// Nur lesend. Läuft im api-Container: `node scripts/diagNeuChurn.mjs`.
import { createDefaultDb } from "/app/src/db.js"

const db = createDefaultDb()
const j = (rows) => console.log(JSON.stringify(rows, null, 2))

console.log("=== 1) 'neu' (30 Tage) je Quelle, absteigend ===")
j((await db.query(`
  SELECT quellen_id, count(*) AS neu
  FROM obstacles WHERE demo=false AND kategorie IN ('baustelle','sperrung')
    AND created_at >= now() - interval '30 days'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 15
`)).rows)

console.log("=== 2) 'weggefallen' (30 Tage) je Quelle, absteigend ===")
j((await db.query(`
  SELECT quellen_id, count(*) AS weggefallen
  FROM obstacles WHERE demo=false AND kategorie IN ('baustelle','sperrung') AND aktiv=false
    AND updated_at >= now() - interval '30 days'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 15
`)).rows)

console.log("=== 3) Churn-Verdacht: 'neu' deckt sich geografisch+kategorisch mit 'weggefallen' ===")
console.log("(gleiche Quelle+Kategorie+Koordinate auf 4 Nachkommastellen ~11m, andere Zeile) — je Quelle")
j((await db.query(`
  WITH neu AS (
    SELECT id, quellen_id, kategorie, name, round(lat::numeric,4) AS lat4, round(lng::numeric,4) AS lng4
    FROM obstacles WHERE demo=false AND kategorie IN ('baustelle','sperrung')
      AND created_at >= now() - interval '30 days'
  ), weg AS (
    SELECT id, quellen_id, kategorie, name, round(lat::numeric,4) AS lat4, round(lng::numeric,4) AS lng4
    FROM obstacles WHERE demo=false AND kategorie IN ('baustelle','sperrung') AND aktiv=false
      AND updated_at >= now() - interval '30 days'
  )
  SELECT n.quellen_id,
    count(*) AS treffer_gesamt,
    count(*) FILTER (WHERE w.name = n.name) AS treffer_gleicher_name
  FROM neu n JOIN weg w
    ON w.quellen_id = n.quellen_id AND w.kategorie = n.kategorie
    AND w.lat4 = n.lat4 AND w.lng4 = n.lng4 AND w.id <> n.id
  GROUP BY n.quellen_id ORDER BY 2 DESC LIMIT 15
`)).rows)

console.log("=== 4) Beispiel-Paare der Top-Churn-Quelle (erste 5) ===")
const top = (await db.query(`
  SELECT quellen_id, count(*) AS n FROM obstacles
  WHERE demo=false AND kategorie IN ('baustelle','sperrung') AND created_at >= now() - interval '30 days'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 1
`)).rows[0]
console.log("Top-Quelle:", top)
if (top) {
  j((await db.query(`
    WITH neu AS (
      SELECT id, externe_id, name, lat, lng, created_at, fach_id
      FROM obstacles WHERE demo=false AND quellen_id=$1 AND kategorie IN ('baustelle','sperrung')
        AND created_at >= now() - interval '30 days'
    ), weg AS (
      SELECT id, externe_id, name, lat, lng, updated_at, fach_id
      FROM obstacles WHERE demo=false AND quellen_id=$1 AND kategorie IN ('baustelle','sperrung')
        AND aktiv=false AND updated_at >= now() - interval '30 days'
    )
    SELECT n.name, n.externe_id AS neue_externe_id, n.fach_id AS neue_fach_id, n.created_at,
      w.externe_id AS alte_externe_id, w.fach_id AS alte_fach_id, w.updated_at AS deaktiviert_am
    FROM neu n JOIN weg w
      ON round(w.lat::numeric,4)=round(n.lat::numeric,4) AND round(w.lng::numeric,4)=round(n.lng::numeric,4)
      AND w.id <> n.id AND w.name = n.name
    LIMIT 5
  `, [top.quellen_id])).rows)
}

console.log("=== 5) Gesamtbestand zur Einordnung ===")
j((await db.query(`
  SELECT
    count(*) FILTER (WHERE aktiv) AS aktiv_gesamt,
    count(*) FILTER (WHERE kategorie IN ('baustelle','sperrung') AND aktiv) AS aktiv_gemeldet,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS created_30d_alle_kat
  FROM obstacles WHERE demo=false
`)).rows)

console.log("=== 6) KI-Anreicherung: löst sie je für sich einen change_hash-Unterschied aus? ===")
console.log("(sollte 0/leer sein — change_hash wird nur aus dem CONNECTOR-Wert berechnet, nie aus dem angereicherten attrs)")
j((await db.query(`SELECT count(*) AS anreicherung_zeilen FROM anreicherung WHERE ziel_typ='obstacle'`)).rows)

process.exit(0)
