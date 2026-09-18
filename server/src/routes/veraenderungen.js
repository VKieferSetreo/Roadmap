// Änderungsverfolgung (nur Admin): belegt quellenübergreifend, wie viel sich am
// Hindernis-Bestand täglich wirklich ändert.
//
// Vier Ereignis-Typen, drei verschiedene Quellen:
//   - "neu"                    ← obstacles.created_at (echter Einfüge-Zeitstempel, nie vom
//                                 Re-Import berührt)
//   - "ausgelaufen"/"entfernt" ← obstacles.aktiv=false + updated_at (Reconcile ist der EINZIGE
//                                 Pfad, der aktiv auf false setzt, WHERE aktiv=true davor — eine
//                                 einmalige, saubere Zustandsänderung, kein Dauerstempel).
//                                 Unterschieden nach gueltig_bis: lag das Enddatum schon VOR der
//                                 Deaktivierung, ist die Maßnahme planmäßig ausgelaufen; war sie
//                                 noch gültig (oder unbefristet) und verschwindet trotzdem aus dem
//                                 Feed, wurde sie vorzeitig entfernt (Auftrag storniert, Quelle
//                                 zieht sie zurück, o.ä.) — das ist das eigentlich auffällige
//                                 Ereignis, nicht das planmäßige Auslaufen.
//   - "geaendert"               ← obstacle_aenderungen (eigene Tabelle, siehe worker/importer.js).
//                                 Läuft erst seit dem Rollout dieser Migration — VOR diesem Datum
//                                 gibt es keine echte Änderungs-Historie, weil UPDATE_SACHFELDER_SQL
//                                 bis dahin bedingungslos jeden Re-Import als "aktualisiert" zählte
//                                 (T-738) und updated_at damit für rückwirkende Auswertung
//                                 unbrauchbar ist (76.721 von 77.715 Zeilen an einem Tag
//                                 gestempelt, nur 7.861 mit wirklich anderem Inhalt — T-737).
//
// "neu"/"ausgelaufen"/"entfernt" sind deshalb für die vollen `tage` Tage belastbar, "geaendert"
// erst ab dem ersten Lauf nach diesem Deploy — das Frontend zeigt das Startdatum offen an.
//
// QUELLEN-ROTATION HERAUSGERECHNET (T-747-Nachbesserung, Max 18.09.: "40.702 Neu" war Rauschen,
// "muss wirklich streng sein"). Diagnose (scripts/diagNeuChurn.mjs, gegen Prod gefahren):
// dieselbe reale Baustelle bekommt bei mehreren Quellen (0145, 0147, 0131, 0214, 0001, …) bei
// jedem Pull eine NEUE externe_id — entweder weil dedupeObstacles() bei mehreren zusammengefassten
// Features einen anderen Repräsentanten wählt (dup#<hash>@<hash> ändert sich) oder weil die
// Quelle selbst Feature-IDs neu vergibt. Der Fuzzy-Match im Importer (worker/importer.js,
// ~300 m) fängt das nur INNERHALB eines Laufs ab, nicht wenn die alte Zeile schon reconciled ist.
// Ergebnis: Reconcile deaktiviert die alte Zeile, der nächste Insert legt eine neue an — "neu"
// UND "weggefallen" zählen dieselbe reale Stelle doppelt, ohne dass sich etwas geändert hat.
//
// Fix HIER (Tracking-Ebene, nicht die Connectoren): ein "neu"-Kandidat zählt nur, wenn KEINE
// andere Zeile derselben Quelle+Kategorie GEOGRAFISCH NAH (CHURN_GEO_LAT/LNG, großzügiger als der
// Importer-Fuzzy-Match — lineare Infrastruktur wie eine mehrwöchige Tunnelsperrung kann ihren
// Referenzpunkt weiter verschieben) ODER mit IDENTISCHEM Namen innerhalb von CHURN_FENSTER_TAGE
// um den Erfassungszeitpunkt deaktiviert wurde (und umgekehrt für "ausgelaufen"/"entfernt"). Der
// Namens-Zweig fängt Fälle, deren Referenzpunkt über den Geo-Radius hinaus wandert.
//
// ZWEITE Sonderregel, empirisch nachgezogen: frisch angebundene Quellen (0234/0235/0236/0135 —
// Erst-Pull nach dem letzten Deploy) lieferten ihren KOMPLETTEN Bestand als "neu", das ist eine
// Erstbefüllung, kein Tages-Delta. Eine Quelle ohne jede Zeile VOR dem Fenster zählt deshalb gar
// nicht mit; ihre Erstbefüllung steht separat in `roh.erstbefuellungNeuerQuellen`.
//
// Wirkung (18.09., alle Kategorien, 30 Tage): 47.898 roh → 6.822 echte "neu" (−86 %), 42.086 roh
// → 4.613 echte "ausgelaufen"+"entfernt" (−89 %). `roh` bleibt im Response — nachvollziehbar
// statt eine geglättete Zahl ohne Beleg.
//
// Strenger Nebeneffekt, gewollt: die KI-Anreicherung (anreicherung/einspielen.js `spieleEin`)
// schreibt attrs direkt per eigenem SQL und läuft NIE über UPDATE_SACHFELDER_SQL — der
// change_hash-Vergleich für "geaendert" sieht deshalb IMMER nur, was der Connector selbst
// liefert (`value`, das eingehende Item), nie den angereicherten DB-Wert. Eine reine
// KI-Anreicherung kann also strukturell nie als "geaendert" auftauchen.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { asyncHandler } from "../util.js"
import { KATEGORIEN } from "../engine/rules.js"

const TAGE_DEFAULT = 30
const TAGE_MAX = 90
// Wie weit vor/nach der Erfassung nach einer weggefallenen "alten Identität" derselben Stelle
// gesucht wird. Grosszuegig, weil strenges Aussieben (weniger "neu" melden) gewollt ist — siehe
// Kommentar oben. 45 Tage deckt auch mehrwoechige Bauphasen mit einer Zwischen-Rotation ab.
const CHURN_FENSTER_TAGE = 45
// Grosszuegiger als der Importer-Fuzzy-Match (dort 0.003/0.0045, ~300 m — der muss praezise
// bleiben, sonst kollabieren echte Bauphasen unterschiedlicher Breite auf eine Zeile). Hier zaehlt
// das Gegenteil: eine lineare Sperrung (Tunnel, langer Autobahnabschnitt) darf ihren Referenzpunkt
// zwischen zwei Laeufen verschieben, ohne als "neu" durchzurutschen. ~1,1 km. ODER-verknuepft mit
// exaktem Namensgleich (siehe CHURN_CTES) fuer Faelle, die selbst das noch verfehlen.
const CHURN_GEO_LAT = 0.01
const CHURN_GEO_LNG = 0.015

/** ?kategorien=baustelle,sperrung → validierte Teilmenge von KATEGORIEN; leer/fehlend → ALLE
 *  Kategorien (der Nutzer entscheidet in der UI, was er sehen will). */
function parseKategorien(raw) {
  if (typeof raw !== "string" || !raw.trim()) return KATEGORIEN
  const gewuenscht = raw.split(",").map((s) => s.trim()).filter(Boolean)
  const gueltig = gewuenscht.filter((k) => KATEGORIEN.includes(k))
  return gueltig.length ? gueltig : KATEGORIEN
}

// Straßenklasse aus strassen_ref (T-747-Erweiterung, Max: "nach Strassen differenzieren —
// Autobahn, Bundesstraße, …"). Empirisch gegen den Bestand geprüft (scripts/diagStrassenklasse.mjs):
// A<Zahl> Autobahn, B<Zahl> Bundesstraße, L/S/St<Zahl> Landes-/Staatsstraße (Bayern/Sachsen nennen
// die Landesstraße "Staatsstraße", St oder S abgekürzt — fachlich dieselbe Ebene, deshalb
// zusammengefasst), K<Zahl> Kreisstraße. Alles andere (benannte Straßen, kein strassen_ref, ~37 %
// des Bestands) ist "sonstige" — bewusst nicht erraten.
const STRASSENKLASSE_CASE = `CASE
  WHEN strassen_ref IS NULL THEN 'unbekannt'
  WHEN strassen_ref ~* '^A[0-9]' THEN 'autobahn'
  WHEN strassen_ref ~* '^B[0-9]' THEN 'bundesstrasse'
  WHEN strassen_ref ~* '^St?[0-9]' THEN 'landesstrasse'
  WHEN strassen_ref ~* '^K[0-9]' THEN 'kreisstrasse'
  ELSE 'sonstige'
END`

/** "echte_neu"/"echte_weg" als CTE-Text — von jeder Abfrage wiederverwendet. Nutzt $1 =
 *  Kategorien-Array, $2 = Tage, $3 = CHURN_GEO_LAT, $4 = CHURN_GEO_LNG, $5 = CHURN_FENSTER_TAGE.
 *  `etablierte_quelle` schliesst Quellen aus, deren gesamter Bestand erst innerhalb des Fensters
 *  entstand (Erstbefüllung, kein Tages-Delta). `weg_typ` auf echte_weg trennt planmäßiges
 *  Auslaufen von vorzeitigem Entfernen (siehe Kopf-Kommentar). */
const CHURN_CTES = `
  etablierte_quelle AS (
    SELECT quellen_id FROM obstacles
    GROUP BY quellen_id
    HAVING min(created_at) < current_date - $2::int * interval '1 day'
  ),
  echte_neu AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.quellen_id IN (SELECT quellen_id FROM etablierte_quelle)
      AND NOT EXISTS (
        SELECT 1 FROM obstacles w
        WHERE w.quellen_id = n.quellen_id AND w.kategorie = n.kategorie AND w.aktiv = false
          AND w.id <> n.id
          AND (
            (w.lat BETWEEN n.lat - $3::float8 AND n.lat + $3::float8
             AND w.lng BETWEEN n.lng - $4::float8 AND n.lng + $4::float8)
            OR w.name = n.name
          )
          AND w.updated_at BETWEEN n.created_at - ($5::int * interval '1 day')
                                AND n.created_at + ($5::int * interval '1 day')
      )
  ),
  echte_weg AS (
    SELECT w.*,
      CASE WHEN w.gueltig_bis IS NOT NULL AND w.gueltig_bis <= w.updated_at::date
           THEN 'ausgelaufen' ELSE 'entfernt' END AS weg_typ
    FROM obstacles w
    WHERE w.demo = false AND w.kategorie = ANY($1) AND w.aktiv = false
      AND w.updated_at >= current_date - $2::int * interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM obstacles n
        WHERE n.quellen_id = w.quellen_id AND n.kategorie = w.kategorie
          AND n.id <> w.id
          AND (
            (n.lat BETWEEN w.lat - $3::float8 AND w.lat + $3::float8
             AND n.lng BETWEEN w.lng - $4::float8 AND w.lng + $4::float8)
            OR n.name = w.name
          )
          AND n.created_at BETWEEN w.updated_at - ($5::int * interval '1 day')
                                AND w.updated_at + ($5::int * interval '1 day')
      )
  )
`

export function veraenderungenRouter({ db }) {
  const r = Router()

  r.get("/uebersicht", requireRole("admin"), asyncHandler(async (req, res) => {
    const tage = Math.min(TAGE_MAX, Math.max(1, Number.parseInt(req.query.tage, 10) || TAGE_DEFAULT))
    const kategorien = parseKategorien(req.query.kategorien)
    const params = [kategorien, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]
    const geaendertFilter = `kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'`

    // EIN Statement statt sieben: echte_neu/echte_weg (der teure Anti-Join) wird nur EINMAL
    // berechnet — Postgres materialisiert eine CTE automatisch, sobald sie mehr als einmal
    // referenziert wird (zr/kat/strasse/lz/vl greifen alle darauf zu). Grund für den Umbau
    // (T-747, 18.09.): sieben PARALLELE Aufrufe des ursprünglich selben teuren Anti-Joins haben
    // dem Postgres-Container gleichzeitig Shared-Memory für Parallel-Worker abverlangt und ihn
    // mit "could not resize shared memory segment … No space left on device" (53100) abstürzen
    // lassen. `db.session` + SET (nicht LOCAL, wirkt für die ganze Verbindung) erzwingt zusätzlich
    // Single-Worker-Ausführung — auf dieser kleinen VM bringt Parallelität ohnehin selten etwas,
    // Stabilität zählt hier mehr als ein paar Sekunden Query-Zeit.
    const { rows: [row] } = await db.session((q) =>
      q.query("SET max_parallel_workers_per_gather = 0").then(() =>
        q.query(
          `WITH ${CHURN_CTES},
           zr AS (
             SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
               coalesce(n.n, 0) AS neu, coalesce(g.n, 0) AS geaendert,
               coalesce(a.n, 0) AS ausgelaufen, coalesce(e.n, 0) AS entfernt
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
             SELECT
               CASE
                 WHEN gueltig_von IS NULL THEN 'unbekannt'
                 WHEN gueltig_bis IS NULL THEN 'lang'
                 WHEN gueltig_bis - gueltig_von <= 7 THEN 'kurz'
                 WHEN gueltig_bis - gueltig_von <= 30 THEN 'mittel'
                 ELSE 'lang'
               END AS laufzeit, count(*) AS n
             FROM echte_neu GROUP BY 1
           ),
           vl AS (
             SELECT
               CASE
                 WHEN gueltig_von IS NULL THEN 'unbekannt'
                 WHEN gueltig_von - created_at::date <= 1 THEN 'spontan'
                 WHEN gueltig_von - created_at::date <= 6 THEN 'kurzfristig'
                 WHEN gueltig_von - created_at::date <= 30 THEN 'geplant'
                 ELSE 'langfristig'
               END AS vorlauf, count(*) AS n
             FROM echte_neu GROUP BY 1
           ),
           roh AS (
             SELECT
               (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
                  AND created_at >= current_date - $2::int * interval '1 day') AS neu,
               (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND aktiv=false
                  AND updated_at >= current_date - $2::int * interval '1 day') AS weggefallen,
               (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
                  AND created_at >= current_date - $2::int * interval '1 day'
                  AND quellen_id NOT IN (SELECT quellen_id FROM etablierte_quelle)) AS erstbefuellung_neuer_quellen
           )
           SELECT
             (SELECT json_agg(zr ORDER BY tag) FROM zr) AS zeitreihe,
             (SELECT json_agg(kat) FROM kat) AS kategorien,
             (SELECT json_agg(strasse) FROM strasse) AS strassenklassen,
             (SELECT json_object_agg(laufzeit, n) FROM lz) AS laufzeiten,
             (SELECT json_object_agg(vorlauf, n) FROM vl) AS vorlaufzeiten,
             (SELECT row_to_json(roh) FROM roh) AS roh,
             (SELECT min(erkannt_am) FROM obstacle_aenderungen) AS geaendert_seit`,
          params,
        ),
      ),
    )

    const bucket = () => ({ neu: {}, ausgelaufen: {}, entfernt: {}, geaendert: {} })
    const kat = bucket()
    for (const r2 of row.kategorien ?? []) kat[r2.typ][r2.kategorie] = Number(r2.n)
    const strasse = bucket()
    for (const r2 of row.strassenklassen ?? []) strasse[r2.typ][r2.klasse] = Number(r2.n)

    const zeitreihe = (row.zeitreihe ?? []).map((t) => ({
      tag: t.tag, neu: Number(t.neu), geaendert: Number(t.geaendert),
      ausgelaufen: Number(t.ausgelaufen), entfernt: Number(t.entfernt),
    }))
    const summe = (feld) => zeitreihe.reduce((s, t) => s + t[feld], 0)

    res.json({
      tage,
      kategorien,
      geaendertTrackingSeit: row.geaendert_seit ?? null,
      zeitreihe,
      gesamt: { neu: summe("neu"), geaendert: summe("geaendert"), ausgelaufen: summe("ausgelaufen"), entfernt: summe("entfernt") },
      // Rohzahlen vor dem Herausrechnen von Quellen-Rotation — Beleg, kein Versteck.
      roh: {
        neu: Number(row.roh?.neu ?? 0),
        weggefallen: Number(row.roh?.weggefallen ?? 0),
        erstbefuellungNeuerQuellen: Number(row.roh?.erstbefuellung_neuer_quellen ?? 0),
      },
      proKategorie: kat,
      proStrassenklasse: strasse,
      laufzeiten: row.laufzeiten ?? {},
      vorlaufzeiten: row.vorlaufzeiten ?? {},
    })
  }))

  return r
}
