// Änderungsverfolgung (nur Admin): belegt quellenübergreifend, wie viel sich am
// Hindernis-Bestand täglich wirklich ändert.
//
// Drei Ereignis-Typen, drei verschiedene Quellen:
//   - "neu"        ← obstacles.created_at (echter Einfüge-Zeitstempel, nie vom Re-Import berührt)
//   - "weggefallen" ← obstacles.aktiv=false + updated_at (Reconcile ist der EINZIGE Pfad, der
//                     aktiv auf false setzt, und tut das WHERE aktiv=true — eine einmalige,
//                     saubere Zustandsänderung, kein Dauerstempel)
//   - "geaendert"   ← obstacle_aenderungen (eigene Tabelle, siehe worker/importer.js). Läuft erst
//                     seit dem Rollout dieser Migration — VOR diesem Datum gibt es keine echte
//                     Änderungs-Historie, weil UPDATE_SACHFELDER_SQL bis dahin bedingungslos jeden
//                     Re-Import als "aktualisiert" zählte (T-738) und updated_at damit für
//                     rückwirkende Auswertung unbrauchbar ist (76.721 von 77.715 Zeilen an einem
//                     einzigen Tag gestempelt, nur 7.861 mit wirklich anderem Inhalt — T-737).
//
// "neu" und "weggefallen" sind deshalb für die vollen `tage` Tage belastbar, "geaendert" erst ab
// dem ersten Lauf nach diesem Deploy — das Frontend zeigt das Startdatum offen an.
//
// QUELLEN-ROTATION HERAUSGERECHNET (T-747-Nachbesserung, Max 18.09.: "40.702 Neu" war Rauschen).
// Diagnose (scripts/diagNeuChurn.mjs, 18.09. gegen Prod gefahren): dieselbe reale Baustelle
// bekommt bei mehreren Quellen (0145, 0147, 0131, 0214, 0001, …) bei jedem Pull eine NEUE
// externe_id — entweder weil dedupeObstacles() bei mehreren zusammengefassten Features einen
// anderen Repräsentanten wählt (dup#<hash>@<hash> ändert sich) oder weil die Quelle selbst
// Feature-IDs neu vergibt. Der Fuzzy-Match im Importer (worker/importer.js, FUZZY_LAT/FUZZY_LNG,
// ~300 m) fängt das nur INNERHALB eines Laufs ab, nicht wenn die alte Zeile schon reconciled ist.
// Ergebnis: Reconcile deaktiviert die alte Zeile, der nächste Insert legt eine neue an — "neu"
// UND "weggefallen" zählen dieselbe reale Stelle doppelt, ohne dass sich etwas geändert hat.
//
// Fix HIER (Tracking-Ebene, nicht die Connectoren): ein "neu"-Kandidat zählt nur, wenn KEINE
// andere Zeile derselben Quelle+Kategorie im selben Radius (CHURN_GEO_TOLERANZ, großzügiger als
// der Importer-Fuzzy-Match — lineare Infrastruktur wie eine mehrwöchige Tunnelsperrung kann ihren
// Referenzpunkt zwischen zwei Läufen über die Importer-Toleranz hinaus verschieben) innerhalb von
// CHURN_FENSTER_TAGE um den Erfassungszeitpunkt deaktiviert wurde (und umgekehrt für
// "weggefallen"). ZWEITE Sonderregel, empirisch nachgezogen (scripts/diagChurnFilterCheck.mjs,
// 18.09.): frisch angebundene Quellen (0234/0235/0236/0135 — Erst-Pull nach dem letzten Deploy)
// lieferten ihren KOMPLETTEN Bestand als "neu", das ist eine Erstbefüllung, kein Tages-Delta.
// Eine Quelle ohne jede Zeile VOR dem Fenster zählt deshalb gar nicht mit; ihre Erstbefüllung
// steht separat in `roh.erstbefuellungNeuerQuellen`. Die roh/gefiltert-Differenz wird mit
// ausgeliefert (`roh` im Response) — nachvollziehbar statt eine geglättete Zahl ohne Beleg.
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
// zwischen zwei Laeufen verschieben, ohne als "neu" durchzurutschen. ~1,1 km.
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

/** "echte_neu"/"echte_weg" als CTE-Text — von jeder der vier Abfragen wiederverwendet.
 *  Nutzt $1 = Kategorien-Array, $2 = Tage, $3 = CHURN_GEO_LAT, $4 = CHURN_GEO_LNG,
 *  $5 = CHURN_FENSTER_TAGE. `etablierte_quelle` schliesst Quellen aus, deren gesamter Bestand
 *  erst innerhalb des Fensters entstand (Erstbefüllung, kein Tages-Delta). */
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
`

export function veraenderungenRouter({ db }) {
  const r = Router()

  r.get("/uebersicht", requireRole("admin"), asyncHandler(async (req, res) => {
    const tage = Math.min(TAGE_MAX, Math.max(1, Number.parseInt(req.query.tage, 10) || TAGE_DEFAULT))
    const kategorien = parseKategorien(req.query.kategorien)
    const params = [kategorien, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]

    const [zeitreihe, kategorieRows, laufzeitRows, vorlaufRows, seitWann, roh] = await Promise.all([
      // Lückenlose Tagesreihe (generate_series), je Typ eine Serie — dieselbe Technik wie
      // analytics.js proTagRows. LEFT JOIN statt UNION-Aggregat, damit ein Tag ohne Ereignis
      // als 0 erscheint statt zu fehlen (sonst "springt" das Chart).
      db.query(
        `WITH ${CHURN_CTES}
         SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
           coalesce(n.n, 0) AS neu, coalesce(w.n, 0) AS weggefallen, coalesce(g.n, 0) AS geaendert
         FROM generate_series(current_date - ($2::int - 1) * interval '1 day', current_date, interval '1 day') d
         LEFT JOIN (SELECT created_at::date AS tag, count(*) AS n FROM echte_neu GROUP BY 1) n ON n.tag = d::date
         LEFT JOIN (SELECT updated_at::date AS tag, count(*) AS n FROM echte_weg GROUP BY 1) w ON w.tag = d::date
         LEFT JOIN (
           SELECT erkannt_am AS tag, count(*) AS n FROM obstacle_aenderungen
           WHERE kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'
           GROUP BY 1
         ) g ON g.tag = d::date
         ORDER BY d`,
        params,
      ),
      // Kategorie-Aufschlüsselung über das ganze Fenster, je Typ.
      db.query(
        `WITH ${CHURN_CTES}
         SELECT kategorie, 'neu' AS typ, count(*) AS n FROM echte_neu GROUP BY 1
         UNION ALL
         SELECT kategorie, 'weggefallen', count(*) FROM echte_weg GROUP BY 1
         UNION ALL
         SELECT kategorie, 'geaendert', count(*) FROM obstacle_aenderungen
           WHERE kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'
           GROUP BY 1`,
        params,
      ),
      // Laufzeit-Klasse (nur echte "neu" — Eigenschaft der Maßnahme selbst, nicht des Ereignisses).
      // Heuristik: gueltig_von fehlt → unbekannt; gueltig_bis fehlt → lang (unbefristet);
      // sonst <=7 Tage kurz, <=30 Tage mittel, darüber lang.
      db.query(
        `WITH ${CHURN_CTES}
         SELECT
           CASE
             WHEN gueltig_von IS NULL THEN 'unbekannt'
             WHEN gueltig_bis IS NULL THEN 'lang'
             WHEN gueltig_bis - gueltig_von <= 7 THEN 'kurz'
             WHEN gueltig_bis - gueltig_von <= 30 THEN 'mittel'
             ELSE 'lang'
           END AS laufzeit, count(*) AS n
         FROM echte_neu
         GROUP BY 1`,
        params,
      ),
      // Vorlaufzeit-Klasse (nur echte "neu"): wie viele Tage zwischen unserer Erst-Erfassung
      // (created_at) und dem Beginn (gueltig_von) liegen.
      db.query(
        `WITH ${CHURN_CTES}
         SELECT
           CASE
             WHEN gueltig_von IS NULL THEN 'unbekannt'
             WHEN gueltig_von - created_at::date <= 1 THEN 'spontan'
             WHEN gueltig_von - created_at::date <= 6 THEN 'kurzfristig'
             WHEN gueltig_von - created_at::date <= 30 THEN 'geplant'
             ELSE 'langfristig'
           END AS vorlauf, count(*) AS n
         FROM echte_neu
         GROUP BY 1`,
        params,
      ),
      // Seit wann läuft "geaendert" überhaupt? Transparenz statt stillschweigend 0 zu zeigen.
      db.query(`SELECT min(erkannt_am) AS seit FROM obstacle_aenderungen`),
      // Rohzahlen OHNE Churn-Filter — Transparenz, wie viel rausgerechnet wurde. Erstbefüllung
      // separat: Zeilen von Quellen, deren gesamter Bestand erst im Fenster entstand.
      db.query(
        `WITH etablierte_quelle AS (
           SELECT quellen_id FROM obstacles GROUP BY quellen_id
           HAVING min(created_at) < current_date - $2::int * interval '1 day'
         )
         SELECT
           (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
              AND created_at >= current_date - $2::int * interval '1 day') AS neu,
           (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND aktiv=false
              AND updated_at >= current_date - $2::int * interval '1 day') AS weggefallen,
           (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
              AND created_at >= current_date - $2::int * interval '1 day'
              AND quellen_id NOT IN (SELECT quellen_id FROM etablierte_quelle)) AS erstbefuellung_neuer_quellen`,
        [kategorien, tage], // nur $1/$2 referenziert — node-pg verlangt exakte Bind-Anzahl
      ),
    ])

    const kat = { neu: {}, weggefallen: {}, geaendert: {} }
    for (const row of kategorieRows.rows) kat[row.typ][row.kategorie] = Number(row.n)

    const gesamtNeu = zeitreihe.rows.reduce((s, t) => s + Number(t.neu), 0)
    const gesamtWeg = zeitreihe.rows.reduce((s, t) => s + Number(t.weggefallen), 0)

    res.json({
      tage,
      kategorien,
      geaendertTrackingSeit: seitWann.rows[0]?.seit ?? null,
      zeitreihe: zeitreihe.rows.map((t) => ({
        tag: t.tag, neu: Number(t.neu), weggefallen: Number(t.weggefallen), geaendert: Number(t.geaendert),
      })),
      gesamt: { neu: gesamtNeu, weggefallen: gesamtWeg, geaendert: zeitreihe.rows.reduce((s, t) => s + Number(t.geaendert), 0) },
      // Rohzahlen vor dem Herausrechnen von Quellen-Rotation — Beleg, kein Versteck.
      roh: {
        neu: Number(roh.rows[0]?.neu ?? 0),
        weggefallen: Number(roh.rows[0]?.weggefallen ?? 0),
        erstbefuellungNeuerQuellen: Number(roh.rows[0]?.erstbefuellung_neuer_quellen ?? 0),
      },
      proKategorie: kat,
      laufzeiten: Object.fromEntries(laufzeitRows.rows.map((r) => [r.laufzeit, Number(r.n)])),
      vorlaufzeiten: Object.fromEntries(vorlaufRows.rows.map((r) => [r.vorlauf, Number(r.n)])),
    })
  }))

  return r
}
