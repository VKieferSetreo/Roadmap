// Einmalige Diagnose (T-748, 19.09., Max: "nur relevante Änderungen, nicht Kleinscheiß"):
// klassifiziert die aktuellen "Neu"-Vorgänge (nach allen bisherigen Fixes: Rotation, Segmente,
// Quellen-Familien) nach wiederkehrenden Namens-Mustern, um empirisch zu sehen, was den
// verbleibenden Bestand ausmacht — Grundlage fuer einen Relevanz-Filter statt Raten.
// Nur lesend. `node scripts/diagKleinscheissKeywords.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { KATEGORIEN } from "/app/src/engine/rules.js"

const db = createDefaultDb()
const CHURN_FENSTER_TAGE = 45
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015
const tage = 30
const QUELLEN_FAMILIEN = [
  { name: "autobahn_gmbh", quellen: ["0001", "0145", "0152"] },
  { name: "berlin_viz", quellen: ["0115", "0114"] },
]
const FAMILIE_VALUES = QUELLEN_FAMILIEN.flatMap((f, fi) =>
  f.quellen.map((q, qi) => `('${q}', ${fi}, ${qi})`),
).join(", ")
const params = [KATEGORIEN, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]

const t0 = Date.now()
const { rows: [row] } = await db.query(
  `WITH
  etablierte_quelle AS (
    SELECT quellen_id FROM obstacles GROUP BY quellen_id
    HAVING min(created_at) < current_date - $2::int * interval '1 day'
  ),
  neu_kandidaten AS (
    SELECT * FROM obstacles n
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
  vorgang_neu AS (
    SELECT DISTINCT ON (quellen_id, kategorie, basisname) * FROM (
      SELECT en.*, regexp_replace(coalesce(en.name, en.id::text),
        '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname
      FROM echte_neu en
    ) x ORDER BY quellen_id, kategorie, basisname, created_at ASC
  ),
  familie_mitglied (quellen_id, familie, prioritaet) AS (VALUES ${FAMILIE_VALUES}),
  familie_dublette_neu AS (
    SELECT a.id FROM vorgang_neu a
    JOIN familie_mitglied fa ON fa.quellen_id = a.quellen_id
    WHERE EXISTS (
      SELECT 1 FROM vorgang_neu b JOIN familie_mitglied fb ON fb.quellen_id = b.quellen_id
      WHERE fb.familie = fa.familie AND b.quellen_id <> a.quellen_id
        AND ((a.strassen_ref IS NOT NULL AND b.strassen_ref = a.strassen_ref) OR (a.name IS NOT NULL AND b.name = a.name))
        AND b.lat BETWEEN a.lat - $3::float8 AND a.lat + $3::float8
        AND b.lng BETWEEN a.lng - $4::float8 AND a.lng + $4::float8
        AND (a.gueltig_von IS NULL OR b.gueltig_bis IS NULL OR a.gueltig_von <= b.gueltig_bis)
        AND (b.gueltig_von IS NULL OR a.gueltig_bis IS NULL OR b.gueltig_von <= a.gueltig_bis)
        AND fb.prioritaet < fa.prioritaet
    )
  ),
  final_neu AS (SELECT * FROM vorgang_neu WHERE id NOT IN (SELECT id FROM familie_dublette_neu)),
  keyword AS (
    SELECT
      CASE
        WHEN name ~* 'Beschilderung' THEN 'Beschilderungsarbeiten'
        WHEN name ~* 'Auf-.?\\s*oder\\s*Abbau|Verkehrsführung' THEN 'Auf-/Abbau Verkehrsführung'
        WHEN name ~* 'Grünpflege|Grünschnitt|Vegetation' THEN 'Grünpflege'
        WHEN name ~* 'Unfallfolgen' THEN 'Unfallfolgen-Beseitigung'
        WHEN name ~* 'Fahrbahnmarkierung|Markierungsarbeiten' THEN 'Markierungsarbeiten'
        WHEN name ~* 'Rastanlage|Parkplatz' THEN 'Rastanlagen/Parkplätze'
        WHEN name ~* 'Messung|Zählung|Erkundung|Bohrung' THEN 'Messung/Erkundung'
        WHEN name ~* 'Reinigung' THEN 'Reinigung'
        WHEN name ~* 'Wanderbaustelle' THEN 'Wanderbaustelle (mobil)'
        ELSE 'Sonstige/spezifisch benannt'
      END AS gruppe,
      CASE WHEN gueltig_von IS NULL OR gueltig_bis IS NULL THEN NULL ELSE gueltig_bis - gueltig_von END AS laufzeit_tage
    FROM final_neu
  )
  SELECT
    (SELECT count(*) FROM final_neu) AS gesamt,
    (SELECT json_agg(t) FROM (
      SELECT gruppe, count(*) AS n, round(avg(laufzeit_tage)) AS avg_laufzeit_tage,
        count(*) FILTER (WHERE laufzeit_tage IS NOT NULL AND laufzeit_tage <= 2) AS n_bis_2_tage
      FROM keyword GROUP BY gruppe ORDER BY count(*) DESC
    ) t) AS gruppen`,
  params,
)
console.log(`Dauer: ${Date.now() - t0} ms`)
console.log(JSON.stringify(row, null, 2))
process.exit(0)
