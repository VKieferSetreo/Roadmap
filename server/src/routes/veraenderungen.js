// GL-Änderungstracking (nur Admin): "es kann nicht sein, dass so viele Änderungen an
// Baustellen/Sperrungen dazukommen" — die GL-Auswertung, die das quellenübergreifend belegt.
//
// Drei Ereignis-Typen, zwei verschiedene Quellen:
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

import { Router } from "express"
import { requireRole } from "../auth.js"
import { asyncHandler } from "../util.js"
import { GEMELDETE_KATEGORIEN } from "../obstaclesRepo.js"
import { KATEGORIEN } from "../engine/rules.js"

const TAGE_DEFAULT = 30
const TAGE_MAX = 90

/** ?kategorien=baustelle,sperrung → validierte Teilmenge von KATEGORIEN; leer/fehlend →
 *  GEMELDETE_KATEGORIEN (das, worüber sich die GL beschwert hat — temporäre Ereignisse,
 *  nicht permanente Infrastruktur wie Brücken/Tunnel). */
function parseKategorien(raw) {
  if (typeof raw !== "string" || !raw.trim()) return GEMELDETE_KATEGORIEN
  const gewuenscht = raw.split(",").map((s) => s.trim()).filter(Boolean)
  const gueltig = gewuenscht.filter((k) => KATEGORIEN.includes(k))
  return gueltig.length ? gueltig : GEMELDETE_KATEGORIEN
}

export function veraenderungenRouter({ db }) {
  const r = Router()

  r.get("/uebersicht", requireRole("admin"), asyncHandler(async (req, res) => {
    const tage = Math.min(TAGE_MAX, Math.max(1, Number.parseInt(req.query.tage, 10) || TAGE_DEFAULT))
    const kategorien = parseKategorien(req.query.kategorien)
    // $2 = tage, als Bind-Parameter statt String-Interpolation (wie hygiene.js PRUNE_*_SQL).
    const params = [kategorien, tage]

    const [zeitreihe, kategorieRows, laufzeitRows, vorlaufRows, seitWann] = await Promise.all([
      // Lückenlose Tagesreihe (generate_series), je Typ eine Serie — dieselbe Technik wie
      // analytics.js proTagRows. LEFT JOIN statt UNION-Aggregat, damit ein Tag ohne Ereignis
      // als 0 erscheint statt zu fehlen (sonst "springt" das Chart).
      db.query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
           coalesce(n.n, 0) AS neu, coalesce(w.n, 0) AS weggefallen, coalesce(g.n, 0) AS geaendert
         FROM generate_series(current_date - ($2::int - 1) * interval '1 day', current_date, interval '1 day') d
         LEFT JOIN (
           SELECT created_at::date AS tag, count(*) AS n FROM obstacles
           WHERE demo = false AND kategorie = ANY($1) AND created_at >= current_date - $2::int * interval '1 day'
           GROUP BY 1
         ) n ON n.tag = d::date
         LEFT JOIN (
           SELECT updated_at::date AS tag, count(*) AS n FROM obstacles
           WHERE demo = false AND kategorie = ANY($1) AND aktiv = false
             AND updated_at >= current_date - $2::int * interval '1 day'
           GROUP BY 1
         ) w ON w.tag = d::date
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
        `SELECT kategorie, 'neu' AS typ, count(*) AS n FROM obstacles
           WHERE demo = false AND kategorie = ANY($1) AND created_at >= current_date - $2::int * interval '1 day'
           GROUP BY 1
         UNION ALL
         SELECT kategorie, 'weggefallen', count(*) FROM obstacles
           WHERE demo = false AND kategorie = ANY($1) AND aktiv = false
             AND updated_at >= current_date - $2::int * interval '1 day'
           GROUP BY 1
         UNION ALL
         SELECT kategorie, 'geaendert', count(*) FROM obstacle_aenderungen
           WHERE kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'
           GROUP BY 1`,
        params,
      ),
      // Laufzeit-Klasse (nur "neu" — Eigenschaft der Maßnahme selbst, nicht des Ereignisses).
      // Heuristik: gueltig_von fehlt → unbekannt; gueltig_bis fehlt → lang (unbefristet);
      // sonst <=7 Tage kurz, <=30 Tage mittel, darüber lang.
      db.query(
        `SELECT
           CASE
             WHEN gueltig_von IS NULL THEN 'unbekannt'
             WHEN gueltig_bis IS NULL THEN 'lang'
             WHEN gueltig_bis - gueltig_von <= 7 THEN 'kurz'
             WHEN gueltig_bis - gueltig_von <= 30 THEN 'mittel'
             ELSE 'lang'
           END AS laufzeit, count(*) AS n
         FROM obstacles
         WHERE demo = false AND kategorie = ANY($1) AND created_at >= current_date - $2::int * interval '1 day'
         GROUP BY 1`,
        params,
      ),
      // Vorlaufzeit-Klasse (nur "neu"): wie spontan wurde die Maßnahme eingestellt — Tage
      // zwischen unserer Erst-Erfassung (created_at) und dem Beginn (gueltig_von).
      db.query(
        `SELECT
           CASE
             WHEN gueltig_von IS NULL THEN 'unbekannt'
             WHEN gueltig_von - created_at::date <= 1 THEN 'spontan'
             WHEN gueltig_von - created_at::date <= 6 THEN 'kurzfristig'
             WHEN gueltig_von - created_at::date <= 30 THEN 'geplant'
             ELSE 'langfristig'
           END AS vorlauf, count(*) AS n
         FROM obstacles
         WHERE demo = false AND kategorie = ANY($1) AND created_at >= current_date - $2::int * interval '1 day'
         GROUP BY 1`,
        params,
      ),
      // Seit wann läuft "geaendert" überhaupt? Transparenz statt stillschweigend 0 zu zeigen.
      db.query(`SELECT min(erkannt_am) AS seit FROM obstacle_aenderungen`),
    ])

    const kat = { neu: {}, weggefallen: {}, geaendert: {} }
    for (const row of kategorieRows.rows) kat[row.typ][row.kategorie] = Number(row.n)

    res.json({
      tage,
      kategorien,
      geaendertTrackingSeit: seitWann.rows[0]?.seit ?? null,
      zeitreihe: zeitreihe.rows.map((t) => ({
        tag: t.tag, neu: Number(t.neu), weggefallen: Number(t.weggefallen), geaendert: Number(t.geaendert),
      })),
      gesamt: {
        neu: zeitreihe.rows.reduce((s, t) => s + Number(t.neu), 0),
        weggefallen: zeitreihe.rows.reduce((s, t) => s + Number(t.weggefallen), 0),
        geaendert: zeitreihe.rows.reduce((s, t) => s + Number(t.geaendert), 0),
      },
      proKategorie: kat,
      laufzeiten: Object.fromEntries(laufzeitRows.rows.map((r) => [r.laufzeit, Number(r.n)])),
      vorlaufzeiten: Object.fromEntries(vorlaufRows.rows.map((r) => [r.vorlauf, Number(r.n)])),
    })
  }))

  return r
}
