// Einmalige Verifikation (T-747, 18.09.): reproduziert die Vorgang-kollabierte /uebersicht-Query
// nach dem letzten Deploy, um die tatsaechlichen finalen Zahlen zu belegen (insb. Autobahn-"neu").
// Nur lesend. `node scripts/diagVorgangVerifikation.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015
const tage = 30
const params = [KATEGORIEN, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]
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
  neu_kandidaten AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.quellen_id IN (SELECT quellen_id FROM etablierte_quelle)
  ),
  echte_neu AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE NOT EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false AND w.id <> nk.id
        AND ((w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8 AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8) OR w.name = nk.name)
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day') AND nk.created_at + ($5::int * interval '1 day')
    )
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
  ),
  vorgang_neu AS (
    SELECT DISTINCT ON (quellen_id, kategorie, basisname) * FROM (
      SELECT en.*, regexp_replace(coalesce(en.name, en.id::text),
        '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname
      FROM echte_neu en
    ) x ORDER BY quellen_id, kategorie, basisname, created_at ASC
  ),
  vorgang_weg AS (
    SELECT DISTINCT ON (quellen_id, kategorie, basisname) * FROM (
      SELECT ew.*, regexp_replace(coalesce(ew.name, ew.id::text),
        '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname
      FROM echte_weg ew
    ) y ORDER BY quellen_id, kategorie, basisname, updated_at DESC
  )
`

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH ${CHURN_CTES}
   SELECT
     (SELECT count(*) FROM echte_neu) AS echte_neu,
     (SELECT count(*) FROM vorgang_neu) AS vorgang_neu,
     (SELECT count(*) FROM rotation_neu) AS rotation_neu,
     (SELECT count(*) FROM vorgang_weg WHERE weg_typ='ausgelaufen') AS ausgelaufen,
     (SELECT count(*) FROM vorgang_weg WHERE weg_typ='entfernt') AS entfernt,
     (SELECT json_agg(t) FROM (
        SELECT ${STRASSENKLASSE_CASE} AS klasse, count(*) AS n FROM vorgang_neu GROUP BY 1 ORDER BY 2 DESC
     ) t) AS neu_je_strasse`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
