// Einmalige Verifikation (T-747, 18.09.): reproduziert exakt die konsolidierte /uebersicht-Query
// (routes/veraenderungen.js) inkl. db.session()+SET, um den Shared-Memory-Crash-Fix vor dem
// nächsten Seitenaufruf zu bestätigen. Nur lesend. `node scripts/diagKonsolidierteQuery.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015
const tage = 30
const params = [KATEGORIEN, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]
const geaendertFilter = `kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'`
const STRASSENKLASSE_CASE = `CASE
  WHEN strassen_ref IS NULL THEN 'unbekannt'
  WHEN strassen_ref ~* '^A[0-9]' THEN 'autobahn'
  WHEN strassen_ref ~* '^B[0-9]' THEN 'bundesstrasse'
  WHEN strassen_ref ~* '^St?[0-9]' THEN 'landesstrasse'
  WHEN strassen_ref ~* '^K[0-9]' THEN 'kreisstrasse'
  ELSE 'sonstige'
END`
const CHURN_CTES = `
  etablierte_quelle AS (
    SELECT quellen_id FROM obstacles GROUP BY quellen_id
    HAVING min(created_at) < current_date - $2::int * interval '1 day'
  ),
  echte_neu AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.quellen_id IN (SELECT quellen_id FROM etablierte_quelle)
      AND NOT EXISTS (
        SELECT 1 FROM obstacles w
        WHERE w.quellen_id = n.quellen_id AND w.kategorie = n.kategorie AND w.aktiv = false AND w.id <> n.id
          AND ((w.lat BETWEEN n.lat - $3::float8 AND n.lat + $3::float8 AND w.lng BETWEEN n.lng - $4::float8 AND n.lng + $4::float8) OR w.name = n.name)
          AND w.updated_at BETWEEN n.created_at - ($5::int * interval '1 day') AND n.created_at + ($5::int * interval '1 day')
      )
  ),
  echte_weg AS (
    SELECT w.*, CASE WHEN w.gueltig_bis IS NOT NULL AND w.gueltig_bis <= w.updated_at::date THEN 'ausgelaufen' ELSE 'entfernt' END AS weg_typ
    FROM obstacles w
    WHERE w.demo = false AND w.kategorie = ANY($1) AND w.aktiv = false
      AND w.updated_at >= current_date - $2::int * interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM obstacles n
        WHERE n.quellen_id = w.quellen_id AND n.kategorie = w.kategorie AND n.id <> w.id
          AND ((n.lat BETWEEN w.lat - $3::float8 AND w.lat + $3::float8 AND n.lng BETWEEN w.lng - $4::float8 AND w.lng + $4::float8) OR n.name = w.name)
          AND n.created_at BETWEEN w.updated_at - ($5::int * interval '1 day') AND w.updated_at + ($5::int * interval '1 day')
      )
  )
`

const t0 = Date.now()
// Testvariante OHNE das SET — prueft, ob die Konsolidierung allein (1 Statement statt 7
// parallele) schon reicht, um den Shared-Memory-Crash zu vermeiden, oder ob Parallel-Worker
// weiterhin abgeschaltet bleiben muessen.
const { rows: [row] } = await db.session((q) =>
  Promise.resolve().then(() =>
    q.query(`
      WITH ${CHURN_CTES},
      zr AS (
        SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
          coalesce(n.n, 0) AS neu, coalesce(g.n, 0) AS geaendert, coalesce(a.n, 0) AS ausgelaufen, coalesce(e.n, 0) AS entfernt
        FROM generate_series(current_date - ($2::int - 1) * interval '1 day', current_date, interval '1 day') d
        LEFT JOIN (SELECT created_at::date AS tag, count(*) AS n FROM echte_neu GROUP BY 1) n ON n.tag = d::date
        LEFT JOIN (SELECT erkannt_am AS tag, count(*) AS n FROM obstacle_aenderungen WHERE ${geaendertFilter} GROUP BY 1) g ON g.tag = d::date
        LEFT JOIN (SELECT updated_at::date AS tag, count(*) AS n FROM echte_weg WHERE weg_typ = 'ausgelaufen' GROUP BY 1) a ON a.tag = d::date
        LEFT JOIN (SELECT updated_at::date AS tag, count(*) AS n FROM echte_weg WHERE weg_typ = 'entfernt' GROUP BY 1) e ON e.tag = d::date
      ),
      kat AS (
        SELECT kategorie, 'neu' AS typ, count(*) AS n FROM echte_neu GROUP BY 1
        UNION ALL SELECT kategorie, weg_typ, count(*) FROM echte_weg GROUP BY 1, 2
        UNION ALL SELECT kategorie, 'geaendert', count(*) FROM obstacle_aenderungen WHERE ${geaendertFilter} GROUP BY 1
      ),
      strasse AS (
        SELECT ${STRASSENKLASSE_CASE} AS klasse, 'neu' AS typ, count(*) AS n FROM echte_neu GROUP BY 1
        UNION ALL SELECT ${STRASSENKLASSE_CASE} AS klasse, weg_typ, count(*) FROM echte_weg GROUP BY 1, weg_typ
        UNION ALL SELECT ${STRASSENKLASSE_CASE} AS klasse, 'geaendert', count(*) FROM obstacle_aenderungen WHERE ${geaendertFilter} GROUP BY 1
      ),
      lz AS (
        SELECT CASE WHEN gueltig_von IS NULL THEN 'unbekannt' WHEN gueltig_bis IS NULL THEN 'lang'
          WHEN gueltig_bis - gueltig_von <= 7 THEN 'kurz' WHEN gueltig_bis - gueltig_von <= 30 THEN 'mittel' ELSE 'lang' END AS laufzeit, count(*) AS n
        FROM echte_neu GROUP BY 1
      ),
      vl AS (
        SELECT CASE WHEN gueltig_von IS NULL THEN 'unbekannt' WHEN gueltig_von - created_at::date <= 1 THEN 'spontan'
          WHEN gueltig_von - created_at::date <= 6 THEN 'kurzfristig' WHEN gueltig_von - created_at::date <= 30 THEN 'geplant' ELSE 'langfristig' END AS vorlauf, count(*) AS n
        FROM echte_neu GROUP BY 1
      ),
      roh AS (
        SELECT
          (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND created_at >= current_date - $2::int * interval '1 day') AS neu,
          (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND aktiv=false AND updated_at >= current_date - $2::int * interval '1 day') AS weggefallen,
          (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND created_at >= current_date - $2::int * interval '1 day'
             AND quellen_id NOT IN (SELECT quellen_id FROM etablierte_quelle)) AS erstbefuellung_neuer_quellen
      )
      SELECT
        (SELECT json_agg(zr ORDER BY tag) FROM zr) AS zeitreihe,
        (SELECT json_agg(kat) FROM kat) AS kategorien,
        (SELECT json_agg(strasse) FROM strasse) AS strassenklassen,
        (SELECT json_object_agg(laufzeit, n) FROM lz) AS laufzeiten,
        (SELECT json_object_agg(vorlauf, n) FROM vl) AS vorlaufzeiten,
        (SELECT row_to_json(roh) FROM roh) AS roh,
        (SELECT min(erkannt_am) FROM obstacle_aenderungen) AS geaendert_seit
    `, params),
  ),
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log("roh:", JSON.stringify(row.roh))
console.log("gesamt neu (Zeitreihe-Summe):", row.zeitreihe.reduce((s, t) => s + Number(t.neu), 0))
console.log("gesamt ausgelaufen:", row.zeitreihe.reduce((s, t) => s + Number(t.ausgelaufen), 0))
console.log("gesamt entfernt:", row.zeitreihe.reduce((s, t) => s + Number(t.entfernt), 0))
console.log("laufzeiten:", JSON.stringify(row.laufzeiten))
console.log("vorlaufzeiten:", JSON.stringify(row.vorlaufzeiten))
console.log("strassenklassen (Top 8):", JSON.stringify(row.strassenklassen.slice(0, 8)))
process.exit(0)
