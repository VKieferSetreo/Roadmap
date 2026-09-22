// Änderungsverfolgung (alle angemeldeten Nutzer): belegt quellenübergreifend, wie viel sich am
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
//   - "geaendert"               ← ZWEI Quellen, addiert:
//                                 (a) obstacle_aenderungen (eigene Tabelle, siehe worker/
//                                 importer.js), echte Sachfeld-Änderung an derselben Zeile. Läuft
//                                 erst seit dem Rollout dieser Migration — VOR diesem Datum gibt
//                                 es keine echte Änderungs-Historie, weil UPDATE_SACHFELDER_SQL
//                                 bis dahin bedingungslos jeden Re-Import als "aktualisiert" zählte
//                                 (T-738) und updated_at damit für rückwirkende Auswertung
//                                 unbrauchbar ist (76.721 von 77.715 Zeilen an einem Tag
//                                 gestempelt, nur 7.861 mit wirklich anderem Inhalt — T-737).
//                                 (b) rotation_neu (siehe unten) — volle Fenster-Historie, weil
//                                 sie aus obstacles.created_at/aktiv abgeleitet ist wie "neu".
//
// "neu"/"ausgelaufen"/"entfernt" und der Rotations-Anteil von "geaendert" sind deshalb für die
// vollen `tage` Tage belastbar; nur der obstacle_aenderungen-Anteil von "geaendert" läuft erst ab
// dem ersten Lauf nach diesem Deploy — das Frontend zeigt das Startdatum offen an.
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
// DRITTE Sonderregel (Max 18.09., Beleg "A48 Brückeninstandsetzung" — EINE reale Baustelle, aber
// 17 Zeilen in 30 Tagen): ein VORGANG kann mehrere physische Segmente haben (dedupeObstacles()
// gruppiert nur auf ~100m, eine kilometerlange Baustelle bleibt also mehrzeilig) UND mehrfach neu
// veröffentlicht werden (externe_id trug in diesem Beispiel einen Versions-Zeitstempel). "neu"/
// "ausgelaufen"/"entfernt" zählen deshalb VORGÄNGE (vorgang_neu/vorgang_weg: Zeilen nach Quelle+
// Kategorie+Basis-Name — Segment-Suffix wie "- Lage-3" abgeschnitten — auf einen Vorgang
// zusammengefasst), nicht Zeilen. Das allein hebt Max' Erwartung ("~100") nicht vollständig ein
// (siehe Diskussion T-747: die verbleibende Menge sind grösstenteils echte, aber KURZE/kleine
// Ereignisse wie Grünpflege/Unfallfolgen-Beseitigung/Beschilderungsarbeiten, kein Datenfehler) —
// per Max-Entscheid bewusst NICHT weiter nach Laufzeit/Stichwort gefiltert.
//
// Wirkung (18.09., alle Kategorien, 30 Tage): 47.898 roh → 6.822 Zeilen nach Rotations-Filter →
// weiter komprimiert durch Vorgangs-Zusammenfassung. `roh` bleibt im Response — nachvollziehbar
// statt eine geglättete Zahl ohne Beleg.
//
// VIERTE Sonderregel, selber Tag: dieselbe Vorgangs-Zusammenfassung gilt für rotation_neu
// (vorgang_rotation) — Max hielt 35.137 Rotations-Treffer für unglaubwürdig hoch. Diagnose
// bestätigte: manche Quellen vergeben die externe_id TÄGLICH neu für denselben laufenden Vorgang,
// 30 Tage Laufzeit erzeugen so 20-30 Treffer für EIN reales Ereignis. Zusammengefasst: 35.137 →
// 22.736 Vorgänge. Geprüft und BEWUSST NICHT verändert: der Namens-Zweig im Match-Prädikat trägt
// nur 2.460 der 35.137 Treffer bei; eine engere Geo-Toleranz (300 m, wie der Importer) drückt
// Rotation zwar weiter, schiebt die Differenz aber symmetrisch in "echte Neu" (6.820 → 16.616) —
// ein Präzisions-/Recall-Tausch ohne objektiv richtige Antwort, keine Bug-Behebung, deshalb
// unverändert gelassen (siehe CHURN_CTES-Kommentar zu vorgang_rotation).
//
// FÜNFTE Sonderregel (T-748, 19.09., Max: "zusammenhängende Baustellen, Dubletten … alle
// rausfiltern, max. Informationsgehalt aus minimalen Punkten"): dieselbe reale Autobahn-Baustelle
// wird oft von MEHREREN Quellen DESSELBEN Herausgebers gleichzeitig gemeldet — 0001 (Autobahn-API,
// öffentlich), 0145 (BAB Arbeitsstellen kürzerer Dauer) und 0152 (BAB Arbeitsstellen längerer
// Dauer Vorschau) sind alle Autobahn GmbH. Diagnose: 74 % der Autobahn-"Neu"-Kandidaten hatten
// eine geografisch nahe + zeitlich überlappende Zeile in einer ANDEREN dieser Quellen; 0001↔0145
// allein erklärte 66 % davon — die einzige Kombination, die der bestehende Dublettenfilter NICHT
// abdeckt (0152 dedupt sich bereits beim Import gegen 0001/0145, siehe
// connectors/0152_bab_ald_vorschau.js). Fix HIER (Tracking-Ebene): final_neu/final_weg
// entfernen aus vorgang_neu/vorgang_weg Zeilen, für die eine höher priorisierte Quelle derselben
// Familie (QUELLEN_FAMILIEN, Priorität = Array-Reihenfolge je Familie) denselben Vorgang bereits
// zählt. Der TIEFERE Fix (0001↔0145 direkt im Connector deduplizieren, würde auch die Kunden-Karte
// ändern) ist eine separate, größere Entscheidung — hier bewusst nicht gemacht. Zweite Familie
// (Berlin VIZ, 0114/0115) siehe QUELLEN_FAMILIEN-Kommentar weiter unten.
//
// SECHSTE Sonderregel (T-748, 19.09., Max: "wir machen auch nur relevante Änderungen als
// Änderungen, nicht Kleinscheiß"): selbst nach allen bisherigen Fixes blieben ~5.050 "Neu"-
// Vorgänge (30 Tage, alle Kategorien) — Stichwort-Prüfung auf administrative Arbeiten
// (Beschilderung, Grünpflege, Markierung, Reinigung, Auf-/Abbau Verkehrsführung, …) traf nur
// ~9 % davon (scripts/diagKleinscheissKeywords.mjs); die übrigen 91 % sind spezifisch benannte
// Maßnahmen mit durchschnittlich 32 Tagen Laufzeit — kein Datenfehler, keine administrative
// Nebensache. Die LAUFZEIT selbst trennt dagegen sauber: 53 % aller Vorgänge sind "kurz" (≤7
// Tage). "Relevant" nutzt deshalb dieselbe "lang"-Klassifikation, die ohnehin schon für die
// Laufzeit-Verteilung berechnet wird (kein neu erfundener Schwellwert) — relevant_neu/
// relevant_weg filtern auf gueltig_von IS NOT NULL AND (gueltig_bis
// IS NULL OR Laufzeit > 30 Tage). Wirkung: Autobahn-"neu" sinkt von 2.353 auf 254
// (scripts/diagAutobahnLangExakt.mjs) — eine Größenordnung näher an Max' Erwartung (~100), ohne
// eine willkürliche neue Zahl zu erfinden. "Kurz"/"mittel" werden NICHT gelöscht, nur aus der
// Kopfzahl ausgeklammert (roh.relevanzAusgeklammertNeu/Weg/Geaendert zeigt wie viele) — der
// Laufzeit-Chart selbst bleibt auf der VOLLEN Verteilung (sonst 100 % "lang", trivial und
// nutzlos). Das ist eine DEFINITIONS-Änderung ("Neu" heißt jetzt "relevant Neu"), keine reine
// Bereinigung — im Frontend entsprechend beschriftet, nicht stillschweigend umbenannt.
//
// Strenger Nebeneffekt, gewollt: die KI-Anreicherung (anreicherung/einspielen.js `spieleEin`)
// schreibt attrs direkt per eigenem SQL und läuft NIE über UPDATE_SACHFELDER_SQL — der
// Quellstand-Vergleich für "geaendert" sieht deshalb IMMER nur, was der Connector selbst
// liefert (`value`, das eingehende Item), nie den angereicherten DB-Wert. Eine reine
// KI-Anreicherung kann also strukturell nie als "geaendert" auftauchen. Am 22.09.2026 gegen
// die Prod-Daten nachgemessen und bestaetigt: von 293 geprueften Eintraegen liess sich kein
// einziger auf die Anreicherung zurueckfuehren.
//
// SEIT T-760 ist "geaendert" ausserdem ENG definiert (obstaclesRepo.js quellStand/standDiff):
// nur das ENDE der Massnahme und die harten Restriktionswerte zaehlen. Der BEGINN zaehlt
// NICHT — er rollt bei der Autobahn GmbH taeglich, weil unser Parser den ersten Termin aus
// einer Terminliste nimmt und der abgelaufene ueber Nacht aus dem Text faellt. Das war die
// Ursache von 258 der 302 Falschmeldungen am 22.09.

import { Router } from "express"
import { asyncHandler } from "../util.js"
import { KATEGORIEN } from "../engine/rules.js"

const TAGE_DEFAULT = 30
const TAGE_MAX = 90
// Ab wann ist die Erfassung VOLLSTAENDIG? "Weggefallen" liest aktiv = false plus updated_at,
// und was die Hygiene hart geloescht hat, fehlt dort ersatzlos (worker/hygiene.js,
// purgeStaleInactive). Aeltere Tage zeigen deshalb im Wesentlichen nur Neuanlagen, und die
// Seite kennzeichnet sie als unvollstaendig, statt sie wie Messwerte darzustellen.
//
// Der Stichtag wird AUS DEM BESTAND abgeleitet, nicht aus der Purge-Frist gerechnet. Der
// Unterschied ist wesentlich: die Frist wurde am 21.09. von 30 auf 120 Tage erhoeht (T-757),
// aber das wirkt nur vorwaerts — alles, was vorher geloescht wurde, bleibt geloescht. Wer
// jetzt "current_date - 120" rechnete, behauptete Vollstaendigkeit fuer drei Monate, die es
// nicht gibt. Der aelteste noch vorhandene Wegfall sagt dagegen die Wahrheit, wandert von
// selbst mit, wenn die Historie waechst, und braucht kein Umstellungsdatum im Code.
// Die untere Schranke faengt den Fall ab, dass gerade gar keine inaktive Zeile existiert.
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

// T-748 (19.09., Max: "zusammenhängende Baustellen, Dubletten … alle rausfiltern, max.
// Informationsgehalt aus minimalen Punkten", danach "weiter nach sowas suchen"). Erste Diagnose
// (scripts/diagQuellenuebergreifendeDubletten.mjs, gegen Prod): 74 % (13.993/18.977) der Autobahn-
// "Neu"-Kandidaten hatten eine geografisch nahe + zeitlich überlappende Zeile in einer ANDEREN
// Quelle mit gleichem strassen_ref. Ursache: 0001 (Autobahn-API, öffentlich), 0145 (BAB
// Arbeitsstellen kürzerer Dauer) und 0152 (BAB Arbeitsstellen längerer Dauer Vorschau) sind ALLE
// Autobahn GmbH. 0152 dedupt sich bereits beim Import gegen 0001/0145
// (connectors/0152_bab_ald_vorschau.js, DEDUP_QUELLEN) — 0001↔0145 NIE, das erklärte allein 66 %
// der gefundenen Überlappungen.
//
// Genereller Nachfolge-Scan über ALLE Quellenpaare (scripts/diagAllgemeineQuellenDubletten.mjs +
// diagQuellenpaareNamen.mjs, geo+Kategorie+Gültigkeit, KEIN Namens- oder Strassen-Filter — bewusst
// die Rohdaten, um nicht auf dieselbe Weise blind zu sein wie die erste Diagnose): 25 Quellenpaare
// mit ≥20 Überlappungen. Manuell mit echten Beispielen geprüft, NICHT blind übernommen — das
// Risiko, echte Ereignisse fälschlich als Dublette zu löschen, ist schlimmer als ein paar sichtbare
// Dubletten übrig zu lassen. Eindeutig bestätigt: 0114/0115 (beide "Berlin VIZ", zwei Feed-Formate
// desselben Herausgebers — Beispiele zeigen WÖRTLICH identische Namen wie "B96a Am Seegraben
// (Altglienicke)" in beiden). Andere Kandidaten (NRW-Staat 0149/0156, Bayern-Staat vs. Städte
// 0147/0210/0224, Brandenburg 0132/0143, A73 an der Thüringen/Bayern-Grenze 0131/0147) zeigten
// GEMISCHTE Evidenz — teils echte Dubletten, teils eindeutig verschiedene reale Ereignisse (z.B.
// 0129↔0148: "Halbseitige Sperrungen" matched gegen "Neubau Einfamilienhaus"; 0115↔0135: Sperrung
// auf einer Straße matched gegen ein Verkehrszeichen-Verbot auf einer ANDEREN Straße) — bewusst
// NICHT aufgenommen, offen für weitere Prüfung.
//
// Fix HIER (Tracking-Ebene, wie schon die Quellen-Rotation): pro Familie eine Zusammenfassung NACH
// der Vorgangs-Gruppierung — MATCH über gleichen strassen_ref ODER exakten Namensgleich (Berlin-
// VIZ-Fälle haben oft keinen strassen_ref, z.B. reine Straßennamen), plus geografische Nähe und
// überlappende Gültigkeit. Der TIEFERE Fix (Dedup direkt im Connector/Importer, würde auch die
// Kunden-Karte ändern) ist eine separate, größere Entscheidung — hier bewusst NICHT gemacht, nur
// die interne Auswertung wird strenger.
const QUELLEN_FAMILIEN = [
  { name: "autobahn_gmbh", quellen: ["0001", "0145", "0152"] },
  { name: "berlin_viz", quellen: ["0115", "0114"] },
]
const FAMILIE_VALUES = QUELLEN_FAMILIEN.flatMap((f, fi) =>
  f.quellen.map((q, qi) => `('${q}', ${fi}, ${qi})`),
).join(", ")

// Straßenklasse aus strassen_ref (T-747-Erweiterung, Max: "nach Strassen differenzieren —
// Autobahn, Bundesstraße, …"). Empirisch gegen den Bestand geprüft (scripts/diagStrassenklasse.mjs):
// A<Zahl> Autobahn, B<Zahl> Bundesstraße, L/S/St<Zahl> Landes-/Staatsstraße (Bayern/Sachsen nennen
// die Landesstraße "Staatsstraße", St oder S abgekürzt — fachlich dieselbe Ebene, deshalb
// zusammengefasst), K<Zahl> Kreisstraße.
//
// KORREKTUR 2026-09-20: Der L-Zweig FEHLTE — `^St?[0-9]` deckt nur S/St, jedes "L123" fiel nach
// "sonstige". Das war ein Versehen, kein Urteil: das zugehoerige Diagnose-Skript filterte damals
// auf '^[ABLK]'. Ausserdem tolerierte das Muster kein Leerzeichen, wodurch DATEX-Refs wie "A 7"
// und "B 6" durchfielen (der Zustaendigkeits-Resolver matcht an derselben Stelle bewusst mit
// `A ?\\d`). Beides behoben. Was danach uebrig bleibt und mindestens drei Buchstaben am Stueck
// traegt, ist ein ausgeschriebener Strassenname — eigene Klasse "gemeindestrasse" statt Sammeltopf.
// Bewusst OHNE Backslash-Klassen: zwischen JS-Template und Postgres-Literal heben sich die
// Escape-Ebenen auf (gemessen: mit '\\s' fiel JEDER Wert nach 'sonstige'). btrim + literales
// Leerzeichen leistet dasselbe und kann nicht kippen.
/** Straßenklasse eines Eintrags. Erst das gemeldete Kennzeichen, dann die aus der Koordinate
 *  aufgeloeste Klasse (worker/strassenklasse.js, obstacles.strassen_klasse) — 41,8 % des
 *  Bestands tragen kein Kennzeichen, haben aber ausnahmslos eine Koordinate.
 *
 *  Max 2026-09-21: "die Ohnes muessen wir aufloesen … und die sonstigen und unbekannten den
 *  anderen zuordnen". Genau dafuer ist der zweite Schritt da. Was auch die Koordinate nicht
 *  aufloest, bleibt 'unbekannt' und wird als "Ohne Zuordnung" ausgewiesen — es auf die echten
 *  Klassen zu verteilen waere geraten, nicht gemessen, und die Seite lebt davon, dass ihre
 *  Zahlen tragen. Die frühere Klasse 'sonstige' (Kennzeichen vorhanden, aber keinem Muster
 *  zuzuordnen) gibt es nicht mehr: sie laeuft jetzt ebenfalls ueber die Koordinate.
 *
 *  `klasseSpalte` ist der Ausdruck, der die aufgeloeste Klasse liefert — obstacle_aenderungen
 *  fuehrt die Spalte nicht selbst und reicht deshalb eine Subquery herein. */
const strassenklasseCase = (klasseSpalte = "strassen_klasse") => `CASE
  WHEN btrim(coalesce(strassen_ref, '')) ~* '^A ?[0-9]' THEN 'autobahn'
  WHEN btrim(coalesce(strassen_ref, '')) ~* '^B ?[0-9]' THEN 'bundesstrasse'
  WHEN btrim(coalesce(strassen_ref, '')) ~* '^(L|St?) ?[0-9]' THEN 'landesstrasse'
  WHEN btrim(coalesce(strassen_ref, '')) ~* '^K ?[0-9]' THEN 'kreisstrasse'
  WHEN strassen_ref ~* '[A-Za-zÄÖÜäöüß]{3}' THEN 'gemeindestrasse'
  WHEN ${klasseSpalte} IS NOT NULL THEN ${klasseSpalte}
  -- KEINE Restkategorie (Max 2026-09-21: "Ohne Zuordnung darf es nicht geben"). Der Fall ist
  -- nach der Koordinaten-Aufloesung praktisch leer — jede aktive Zeile im Bestand traegt eine
  -- Koordinate (gemessen: 79.301 von 79.301), und OSRM verortet sie auf dem Fahrnetz. Bleibt
  -- eine Zeile trotzdem uebrig (Quelle noch nicht durch den Auflaufer, OSRM zur Laufzeit nicht
  -- erreichbar), gilt dieselbe Hierarchie wie dort: ohne nachweisbares Kennzeichen ist eine
  -- Stelle keine Autobahn, Bundes-, Landes- oder Kreisstrasse, also kommunal.
  ELSE 'gemeindestrasse'
END`
const STRASSENKLASSE_CASE = strassenklasseCase()
// obstacle_aenderungen traegt nur den strassen_ref-Schnappschuss. Die Subquery greift erst,
// wenn keines der Kennzeichen-Muster trifft (CASE wertet von oben nach unten aus), und die
// Tabelle ist klein — ein Tageswert liegt im zweistelligen Bereich.
const STRASSENKLASSE_CASE_AENDERUNG = strassenklasseCase(
  "(SELECT o.strassen_klasse FROM obstacles o WHERE o.id = obstacle_aenderungen.obstacle_id)",
)

/** "echte_neu"/"rotation_neu"/"echte_weg" als CTE-Text — von jeder Abfrage wiederverwendet.
 *  Nutzt $1 = Kategorien-Array, $2 = Tage, $3 = CHURN_GEO_LAT, $4 = CHURN_GEO_LNG,
 *  $5 = CHURN_FENSTER_TAGE. `quelle_start` klammert die ersten 14 Tage jeder Quelle aus
 *  (Einschwingphase, Bestandsaufnahme statt Tages-Delta). `weg_typ` auf
 *  echte_weg trennt planmäßiges Auslaufen von vorzeitigem Entfernen (siehe Kopf-Kommentar).
 *
 *  echte_neu/rotation_neu sind eine Partition von neu_kandidaten über EXISTS/NOT EXISTS auf
 *  DASSELBE Prädikat (bewusst dupliziert, nicht als eine Scalar-Subquery mit LIMIT 1 — eine
 *  Scalar-Subquery im SELECT ist für Postgres immer ein korrelierter Subplan pro Zeile und wird
 *  NIE zu einem Semi-/Anti-Join umgeplant; EXISTS/NOT EXISTS dagegen schon. Verifiziert 18.09.:
 *  die Scalar-Variante lief in Prod in ein Statement-Timeout, die EXISTS-Variante lief vorher
 *  bereits nachweislich in 18-48s — scripts/diagKonsolidierteQuery.mjs). */
const CHURN_CTES = `
  -- EINSCHWINGPHASE JE QUELLE (Max 2026-09-21, "das war Rollout, den bitte stutzen").
  -- Wird eine Quelle angebunden, ist alles, was sie in den ersten Tagen liefert, Bestands-
  -- aufnahme: nicht unterscheidbar, ob eine Baustelle gerade gemeldet wurde oder nur bei uns
  -- noch nicht erfasst war. Erst danach ist "neu" eine Aussage.
  --
  -- Das ersetzt den frueheren Alles-oder-nichts-Guard (Quelle zaehlte gar nicht, solange ihr
  -- erster Eintrag im Fenster lag). Der war in beide Richtungen ungenau: eine vor 60 Tagen
  -- angebundene Quelle verschwand im 90-Tage-Fenster komplett, waehrend der Rollout einer schon
  -- laenger bekannten Quelle voll durchschlug. Der ganze Bestand wurde Mitte Juni erstbefuellt
  -- (alle Quellen tragen min(created_at) zwischen dem 13. und 25.06.), das 90-Tage-Fenster faengt
  -- also mitten im Rollout an — genau der Balken, den Max im Chart sah.
  --
  -- 14 Tage, am Bestand gemessen: der 04.07. faellt von 15.071 auf 158, der 23.06. auf 0, der
  -- 28.06. von 3.081 auf 261, waehrend normale Tage unberuehrt bleiben (18.09.: 1.983 auf 1.980).
  -- Mit 7 Tagen wirkt die Regel beim 04.07. gar nicht: Quelle 0157 startete am 23.06., der
  -- Rollout lag auf Tag 11.
  quelle_start AS (
    SELECT quellen_id, min(created_at)::date + 14 AS zaehlt_ab
      FROM obstacles WHERE demo = false GROUP BY quellen_id
  ),
  -- BEFUELLUNGSTAGE (Max 2026-09-21: "haben da noch einen Ausreisser, glaube das war Rollout,
  -- den bitte stutzen"). Ein Kataster bekommt nicht an einem Tag 14.889 neue Restriktionen: es
  -- wird befuellt. Solche Tage sind technische Ereignisse von uns, keine Meldungen der Behoerde,
  -- und sie zerlegen die Chart-Skala, bis daneben kein echter Tag mehr sichtbar ist.
  --
  -- Die Einschwingphase oben deckt nur die ANBINDUNG einer Quelle ab. Eine laengst bekannte
  -- Quelle, die spaeter umgebaut und neu eingelesen wird, laeuft weiter durch: Quelle 0157 (SEVAS NRW)
  -- legte am 04.07. 14.889 Zeilen an, 67 % ihres gesamten Bestands, und am 23.06. weitere 5.192.
  --
  -- Zwei Kriterien, gemessen am Bestand statt geraten, jedes mit eigener Bedeutung:
  --   Anteil  — mehr als ein Fuenftel des Gesamtbestands der Quelle an EINEM Tag. Echte aktive
  --             Tage grosser Quellen liegen bei 3 bis 5 %, in der Spitze bei 12 %.
  --   Faktor  — mehr als das Hundertfache eines typischen Tages derselben Quelle. Faengt den
  --             Umbau einer sehr grossen Quelle, bei der schon 9 % des Bestands ein Ausreisser
  --             sind (0157 am 28.06.: 1.993 Zeilen bei einem Median von 2). Bewusst 100 und
  --             nicht 10: bei Faktor 10 faellt Quelle 0145 an fuenf voellig normalen Tagen mit
  --             heraus (Median 39, echte Tageswerte um 540).
  -- Mindestmenge 200, damit kleine Quellen nicht bei jedem Alltagslauf als "befuellt" gelten.
  tagesmenge_quelle AS (
    SELECT quellen_id, created_at::date AS tag, count(*) AS n
      FROM obstacles WHERE demo = false GROUP BY 1, 2
  ),
  quelle_profil AS (
    SELECT quellen_id, count(*) AS tage, sum(n) AS gesamt,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS median_tag
      FROM tagesmenge_quelle GROUP BY 1
  ),
  befuellungstag AS (
    SELECT t.quellen_id, t.tag
      FROM tagesmenge_quelle t JOIN quelle_profil p USING (quellen_id)
     WHERE t.n >= 200
       AND (t.n > 0.2 * p.gesamt OR (p.tage >= 5 AND t.n > 100 * greatest(p.median_tag, 1)))
  ),
  neu_kandidaten AS (
    SELECT n.* FROM obstacles n
    WHERE n.demo = false AND n.kategorie = ANY($1)
      AND n.created_at >= current_date - $2::int * interval '1 day'
      AND n.created_at::date >= (SELECT qs.zaehlt_ab FROM quelle_start qs WHERE qs.quellen_id = n.quellen_id)
      AND NOT EXISTS (
        SELECT 1 FROM befuellungstag bt
        WHERE bt.quellen_id = n.quellen_id AND bt.tag = n.created_at::date
      )
  ),
  echte_neu AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE NOT EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false
        AND w.id <> nk.id
        AND (
          (w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8
           AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8)
          OR w.name = nk.name
        )
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day')
                              AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  rotation_neu AS (
    SELECT nk.* FROM neu_kandidaten nk
    WHERE EXISTS (
      SELECT 1 FROM obstacles w
      WHERE w.quellen_id = nk.quellen_id AND w.kategorie = nk.kategorie AND w.aktiv = false
        AND w.id <> nk.id
        AND (
          (w.lat BETWEEN nk.lat - $3::float8 AND nk.lat + $3::float8
           AND w.lng BETWEEN nk.lng - $4::float8 AND nk.lng + $4::float8)
          OR w.name = nk.name
        )
        AND w.updated_at BETWEEN nk.created_at - ($5::int * interval '1 day')
                              AND nk.created_at + ($5::int * interval '1 day')
    )
  ),
  -- WANN ist eine Massnahme weggefallen? (Max 2026-09-21: "alles ueber den letzten 30 Tagen sind
  -- nur neu, rekonstruiere so weit es geht die Verteilung".)
  --
  -- Bis hierher zaehlte fuer beide Wegfall-Arten der Tag, an dem UNSER Abgleich es bemerkte
  -- (updated_at). Fuer eine planmaessig AUSGELAUFENE Massnahme ist das die falsche Auskunft: sie
  -- endete an ihrem eigenen Enddatum, oft Wochen vorher. Beleg im Bestand: 1.330 Zeilen mit
  -- gueltig_bis zwischen 31 und 90 Tagen zurueck, alle erst spaeter deaktiviert — im Chart
  -- standen sie am Deaktivierungstag statt am Auslauftag.
  --
  -- Das ist zugleich der Grund, warum aelter als 30 Tage nur gruene Balken standen: die Hygiene
  -- raeumt inaktive Zeilen nach 30 Tagen weg (purgeStaleInactive), also gibt es ueber updated_at
  -- dort nichts mehr zu sehen. gueltig_bis ueberlebt das, solange die Zeile existiert.
  --
  -- Fuer VORZEITIG ENTFERNTE bleibt es bei updated_at: wann eine Massnahme aus dem Feed
  -- verschwand, weiss nur der Abgleich, ein besseres Datum gibt es nicht. Deren Historie bleibt
  -- deshalb auf die letzten 30 Tage begrenzt, und das ist ehrlicher, als sie zu erfinden.
  --
  -- Der updated_at-Filter bleibt als VORFILTER stehen, obwohl datiert wird nach weg_am: er
  -- bedient den Index obstacles_inaktiv_updated_idx, und er schneidet nichts Falsches weg.
  -- Bei einer ausgelaufenen Zeile ist gueltig_bis <= updated_at, das Ereignis liegt also nie
  -- naeher an heute als der Stempel; was der Vorfilter durchlaesst, entscheidet danach die
  -- weg_am-Bedingung. Ohne ihn lief die Abfrage in Prod ins Statement-Timeout (Seq-Scan ueber
  -- den vollen Bestand statt Index-Scan).
  echte_weg AS (
    SELECT w.*,
      CASE WHEN w.gueltig_bis IS NOT NULL AND w.gueltig_bis <= w.updated_at::date
           THEN 'ausgelaufen' ELSE 'entfernt' END AS weg_typ,
      CASE WHEN w.gueltig_bis IS NOT NULL AND w.gueltig_bis <= w.updated_at::date
           THEN w.gueltig_bis ELSE w.updated_at::date END AS weg_am
    FROM obstacles w
    WHERE w.demo = false AND w.kategorie = ANY($1) AND w.aktiv = false
      AND w.updated_at >= current_date - $2::int * interval '1 day'
      AND (CASE WHEN w.gueltig_bis IS NOT NULL AND w.gueltig_bis <= w.updated_at::date
                THEN w.gueltig_bis ELSE w.updated_at::date END)
          BETWEEN current_date - $2::int * interval '1 day' AND current_date
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
  ),
  -- VORGANG statt Zeile (T-747-Nachbesserung, Max 18.09.: "Segmente pro Vorgang zusammenfassen"
  -- — Beleg 'A48 Brückeninstandsetzung': eine reale Baustelle über mehrere km, dedupeObstacles()
  -- gruppiert nur auf ~100m, jedes Segment landet als eigene Zeile). BASISNAME schneidet einen
  -- Segment-Suffix ab ("... - Lage-3" → "..."), fehlender Name faellt auf die eigene id zurueck
  -- (nie fremde namenlose Zeilen zusammenfassen). DISTINCT ON: ein Vorgang = eine Zeile, die
  -- frueheste (neu) bzw. spaeteste (weg) als Repräsentant für Laufzeit/Vorlauf/Straßenklasse.
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
  ),
  -- Dieselbe Vorgangs-Zusammenfassung wie oben, aber auf rotation_neu (Max 18.09., zweite Kritik
  -- am selben Tag: "35.137 Rotationen kann ich mir kaum vorstellen, fasse zusammen"). Diagnose
  -- bestätigte den Verdacht: manche Quellen (0145/0147/0001 u.a.) vergeben die externe_id TÄGLICH
  -- neu für denselben laufenden Vorgang — 30 Tage Laufzeit können so 20-30 Rotations-"Treffer"
  -- für EIN reales Ereignis erzeugen (scripts/diagRotationGranularitaet.mjs: 35.137 Zeilen auf
  -- 22.736 Vorgänge). Getrennt geprüft und NICHT verändert: der Namens-Zweig im Match-Prädikat
  -- selbst erzeugte nur 2.460 der 35.137 Treffer (scripts/diagNamensmatchFalschpositiv.mjs) und
  -- eine engere Geo-Toleranz (300 m wie der Importer-Fuzzy-Match) drückt rotation zwar auf 25.341,
  -- schiebt die Differenz aber symmetrisch in "echte Neu" (6.820 → 16.616) — ein Praezisions-
  -- /Recall-Tausch ohne objektiv richtige Antwort, keine Bug-Behebung. Bewusst NICHT angefasst,
  -- Max entscheidet das separat (scripts/diagGeoToleranzVergleich.mjs dokumentiert die Zahlen).
  vorgang_rotation AS (
    SELECT DISTINCT ON (quellen_id, kategorie, basisname) * FROM (
      SELECT rn.*, regexp_replace(coalesce(rn.name, rn.id::text),
        '\\s*[-/]?\\s*(Lage|Teil|Abschnitt|Los)[\\s.:-]*[0-9]+\\s*$', '', 'i') AS basisname
      FROM rotation_neu rn
    ) z ORDER BY quellen_id, kategorie, basisname, created_at ASC
  ),
  -- T-748: KREUZQUELLEN-Zusammenfassung, NACH der Vorgangs-Gruppierung — derselbe Vorgang, von
  -- mehreren Quellen DERSELBEN Familie (familie_mitglied, siehe QUELLEN_FAMILIEN) gleichzeitig
  -- gemeldet: gleicher strassen_ref ODER exakter Namensgleich (Berlin-VIZ-Fälle haben oft keinen
  -- strassen_ref), geografisch nah, Gültigkeit überlappend. Priorität = Reihenfolge im jeweiligen
  -- Familien-Array (fm.prioritaet, 0 = gewinnt). Ein Vorgang verliert nur gegen einen mit STRIKT
  -- besserer Priorität DERSELBEN Familie, nie gegen einen gleich-/schlechter-priorisierten oder
  -- einen aus einer ANDEREN Familie — kein gegenseitiges Ausschließen möglich.
  familie_mitglied (quellen_id, familie, prioritaet) AS (VALUES ${FAMILIE_VALUES}),
  familie_dublette_neu AS (
    SELECT a.id FROM vorgang_neu a
    JOIN familie_mitglied fa ON fa.quellen_id = a.quellen_id
    WHERE EXISTS (
      SELECT 1 FROM vorgang_neu b
      JOIN familie_mitglied fb ON fb.quellen_id = b.quellen_id
      WHERE fb.familie = fa.familie AND b.quellen_id <> a.quellen_id
        AND (
          (a.strassen_ref IS NOT NULL AND b.strassen_ref = a.strassen_ref)
          OR (a.name IS NOT NULL AND b.name = a.name)
        )
        AND b.lat BETWEEN a.lat - $3::float8 AND a.lat + $3::float8
        AND b.lng BETWEEN a.lng - $4::float8 AND a.lng + $4::float8
        AND (a.gueltig_von IS NULL OR b.gueltig_bis IS NULL OR a.gueltig_von <= b.gueltig_bis)
        AND (b.gueltig_von IS NULL OR a.gueltig_bis IS NULL OR b.gueltig_von <= a.gueltig_bis)
        AND fb.prioritaet < fa.prioritaet
    )
  ),
  final_neu AS (SELECT * FROM vorgang_neu WHERE id NOT IN (SELECT id FROM familie_dublette_neu)),
  familie_dublette_weg AS (
    SELECT a.id FROM vorgang_weg a
    JOIN familie_mitglied fa ON fa.quellen_id = a.quellen_id
    WHERE EXISTS (
      SELECT 1 FROM vorgang_weg b
      JOIN familie_mitglied fb ON fb.quellen_id = b.quellen_id
      WHERE fb.familie = fa.familie AND b.quellen_id <> a.quellen_id
        AND (
          (a.strassen_ref IS NOT NULL AND b.strassen_ref = a.strassen_ref)
          OR (a.name IS NOT NULL AND b.name = a.name)
        )
        AND b.lat BETWEEN a.lat - $3::float8 AND a.lat + $3::float8
        AND b.lng BETWEEN a.lng - $4::float8 AND a.lng + $4::float8
        AND (a.gueltig_von IS NULL OR b.gueltig_bis IS NULL OR a.gueltig_von <= b.gueltig_bis)
        AND (b.gueltig_von IS NULL OR a.gueltig_bis IS NULL OR b.gueltig_von <= a.gueltig_bis)
        AND fb.prioritaet < fa.prioritaet
    )
  ),
  final_weg AS (SELECT * FROM vorgang_weg WHERE id NOT IN (SELECT id FROM familie_dublette_weg)),
  -- RELEVANZ-Filter (T-748, 19.09., Max: "wir machen auch nur relevante Änderungen als
  -- Änderungen, nicht Kleinscheiß"). Empirisch geprüft (scripts/diagKleinscheissKeywords.mjs):
  -- Stichwort-Filterung auf administrative Arbeiten (Beschilderung, Grünpflege, Markierung, …)
  -- greift nur bei ~9 % des Bestands — die übrigen 91 % sind spezifisch benannte, im Schnitt
  -- 32 Tage laufende Maßnahmen, kein "Kleinscheiß" im engeren Sinn. Die LAUFZEIT dagegen trennt
  -- sauber: 53 % aller Vorgänge sind "kurz" (≤7 Tage). "Relevant" = dieselbe "lang"-Klasse, die
  -- ohnehin schon für Laufzeiten/vl berechnet wird (kein neuer Schwellwert erfunden) — Autobahn
  -- sinkt damit von 2.353 auf 254 (scripts/diagAutobahnLangExakt.mjs), eine Größenordnung näher an
  -- Max' Erwartung, ohne eine willkürliche neue Zahl zu erfinden. "Kurz"/"mittel" werden NICHT
  -- gelöscht, nur aus der Kopfzahl ausgeklammert — Laufzeit-Chart zeigt weiterhin ALLE Vorgänge
  -- (sonst würde sie trivial zu 100 % "lang" und ihren Zweck verlieren), roh bleibt vollständig.
  relevant_neu AS (
    SELECT * FROM final_neu
    WHERE gueltig_von IS NOT NULL AND (gueltig_bis IS NULL OR gueltig_bis - gueltig_von > 30)
  ),
  relevant_weg AS (
    SELECT * FROM final_weg
    WHERE gueltig_von IS NOT NULL AND (gueltig_bis IS NULL OR gueltig_bis - gueltig_von > 30)
  )
`

// ── SELBSTKONTROLLE DER AENDERUNGSMETRIK (T-749) ────────────────────────────────────────
//
// Am 21.09.2026 meldete die Seite 800 "geaenderte" Hindernisse an einem Sonntag. Der Fehler saß
// im Importer (geprueft wurde jedes eingehende Item, geschrieben nur das letzte), und er fiel
// NUR auf, weil Max die Zahl nicht glaubte. Das ist der eigentliche Mangel: die Metrik konnte
// nicht selbst merken, dass sie kaputt war.
//
// Diese zwei Schwellen schließen die Lücke. Sie prüfen nicht den bekannten Fehler — der ist
// gefixt —, sondern die SIGNATUR, die jede kaputte Aenderungsmetrik hat, egal aus welcher
// Ursache:
//
// 1. WIEDERHOLUNG. Eine Aenderung ist ein Ereignis, sie passiert einmal. Meldet die Metrik
//    dieselbe Zeile morgen wieder, bewertet sie einen Zustand statt einen Vorgang. Am 21.09.
//    lag diese Quote bei 97 % (615 von 635); nach dem Fix bei praktisch null. 25 % lassen
//    reichlich Luft fuer echte Faelle (eine Quelle, die an zwei Tagen hintereinander wirklich
//    nachbessert) und haetten den Fehler am zweiten Tag gemeldet.
// 2. TAGESMENGE. Faengt Ursachen ohne Wiederholungsmuster ab, etwa einen Connector-Umbau, der
//    einmalig den halben Bestand als geaendert meldet.
// 3. EINQUELLIGKEIT (T-760). Kippt eine einzelne Quelle, faellt das weder ueber die Wiederholung
//    noch ueber die Menge auf — eine Quelle liefert leicht ein paar hundert Zeilen, ohne dass
//    eine davon sich wiederholt.
//
// BEIDE ERSTEN SCHWELLEN HABEN AM 22.09.2026 VERSAGT, und zwar knapp: 302 Aenderungen bei
// Schwelle 300 waeren gerade so durchgegangen, und die Wiederholungsquote lag bei 2 % (13 von
// 572), weil die Autobahn-Identifier taeglich rotieren und das Rauschen jeden Tag auf andere
// Zeilen legen. Gemeldet wurde nichts, obwohl die Metrik um das Dreissigfache danebenlag.
// Deshalb: Menge auf 50 (Max' Erwartung sind 2 bis 10 am Tag, das Zehnfache ist reichlich Luft)
// und der dritte Befund, der genau die Signatur dieses Falls hat — 293 von 302 kamen aus 0001.
//
// Unter TRACKING_MIN_MASSE werden die Anteile nicht geprueft: bei einer Handvoll Aenderungen ist
// ein Anteil kein Signal, sondern Zufall.
const TRACKING_WIEDERHOLUNG_MAX = 0.25
const TRACKING_TAGESMENGE_MAX = 50
const TRACKING_EINQUELLIG_MAX = 0.6
const TRACKING_MIN_MASSE = 30

/** Befunde der Selbstkontrolle — reine Rechnung auf den roh-Zahlen, damit testbar. */
export function pruefeTrackingGuete(roh, {
  wiederholungMax = TRACKING_WIEDERHOLUNG_MAX,
  tagesmengeMax = TRACKING_TAGESMENGE_MAX,
  einquelligMax = TRACKING_EINQUELLIG_MAX,
  minMasse = TRACKING_MIN_MASSE,
} = {}) {
  const heute = Number(roh?.geaendertHeute ?? 0)
  const gestern = Number(roh?.geaendertGestern ?? 0)
  const wiederholt = Number(roh?.wiederholtVomVortag ?? 0)
  const befunde = []
  if (gestern >= minMasse && wiederholt / gestern > wiederholungMax) {
    befunde.push({
      art: "wiederholung",
      grund: `${wiederholt} von ${gestern} gestrigen Aenderungen wurden heute erneut gemeldet ` +
             `(${Math.round((wiederholt / gestern) * 100)} %, erlaubt sind ${Math.round(wiederholungMax * 100)} %)`,
    })
  }
  if (heute > tagesmengeMax) {
    befunde.push({ art: "tagesmenge", grund: `${heute} Aenderungen heute (Schwelle ${tagesmengeMax})` })
  }
  const groessteQuelle = Number(roh?.geaendertHeuteGroessteQuelle ?? 0)
  if (heute >= minMasse && groessteQuelle / heute > einquelligMax) {
    befunde.push({
      art: "einquellig",
      grund: `${groessteQuelle} von ${heute} Aenderungen stammen aus einer einzigen Quelle ` +
             `(${Math.round((groessteQuelle / heute) * 100)} %, erlaubt sind ${Math.round(einquelligMax * 100)} %)` +
             ` — das ist die Signatur eines kippenden Connectors, nicht die von Behoerdenmeldungen`,
    })
  }
  return befunde
}

/** Reine Berechnung, kein HTTP — vom Route-Handler (Cache-Miss-Fallback) UND vom taeglichen
 *  Worker-Cron (worker/index.js runVeraenderungenCache) genutzt. Kategorien sind fix "alle": das
 *  Frontend fragt nie eine Teilmenge ab (T-747-Nachbesserung, eingedampft), das haelt den Cache
 *  auf einen einzigen Schluessel (`tage`). */
export async function berechneUebersicht(db, tage) {
  const kategorien = KATEGORIEN
  const params = [kategorien, tage, CHURN_GEO_LAT, CHURN_GEO_LNG, CHURN_FENSTER_TAGE]
  const geaendertFilter = `kategorie = ANY($1) AND erkannt_am >= current_date - $2::int * interval '1 day'`
  // Dieselbe Relevanz-Regel wie relevant_neu/relevant_weg (T-748) — auf obstacle_aenderungen
  // angewendet, das dieselben gueltig_von/gueltig_bis-Spalten trägt (Migration 081).
  const relevantFilter = `${geaendertFilter} AND gueltig_von IS NOT NULL AND (gueltig_bis IS NULL OR gueltig_bis - gueltig_von > 30)`

  // EIN Statement statt sieben: echte_neu/echte_weg (der teure Anti-Join) wird nur EINMAL
  // berechnet — Postgres materialisiert eine CTE automatisch, sobald sie mehr als einmal
  // referenziert wird (zr/kat/strasse/lz/vl greifen alle darauf zu). Grund für den Umbau
  // (T-747, 18.09.): sieben PARALLELE Aufrufe desselben teuren Anti-Joins (Promise.all) haben
  // dem Postgres-Container gleichzeitig Shared-Memory für Parallel-Worker abverlangt und ihn mit
  // "could not resize shared memory segment … No space left on device" (53100) abstürzen lassen.
  // Gemessen (scripts/diagKonsolidierteQuery*.mjs, 18.09.): die Konsolidierung allein behebt es
  // bereits (ein Statement braucht nur einmal Shared Memory, nicht mehr sieben gleichzeitig) —
  // ein zusätzliches `SET max_parallel_workers_per_gather = 0` macht die Query nur ~3× langsamer
  // (48 s statt 18 s) ohne messbaren Stabilitätsgewinn, deshalb NICHT gesetzt.
  const { rows: [row] } = await db.query(
    `WITH ${CHURN_CTES},
         zr AS (
           SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
             coalesce(n.n, 0) AS neu, coalesce(g.n, 0) AS geaendert,
             coalesce(a.n, 0) AS ausgelaufen, coalesce(e.n, 0) AS entfernt
           FROM generate_series(current_date - ($2::int - 1) * interval '1 day', current_date, interval '1 day') d
           LEFT JOIN (SELECT created_at::date AS tag, count(*) AS n FROM relevant_neu GROUP BY 1) n ON n.tag = d::date
           LEFT JOIN (SELECT erkannt_am AS tag, count(*) AS n FROM obstacle_aenderungen WHERE ${relevantFilter} GROUP BY 1) g ON g.tag = d::date
           LEFT JOIN (SELECT weg_am AS tag, count(*) AS n FROM relevant_weg WHERE weg_typ = 'ausgelaufen' GROUP BY 1) a ON a.tag = d::date
           LEFT JOIN (SELECT weg_am AS tag, count(*) AS n FROM relevant_weg WHERE weg_typ = 'entfernt' GROUP BY 1) e ON e.tag = d::date
         ),
         -- "neu"/"ausgelaufen"/"entfernt" zählen VORGÄNGE (vorgang_neu/vorgang_weg), nicht
         -- Zeilen — ein Vorgang mit mehreren Segmenten zählt einmal (siehe CHURN_CTES-Kommentar).
         -- "geaendert" ist AUSSCHLIESSLICH die echte Inhalts-Aenderung durch die Quelle
         -- (obstacle_aenderungen: Hash ueber kategorie/name/strassenRef/gueltigVon/gueltigBis/attrs
         -- der EINGEHENDEN Quelldaten). Quellen-Rotation zaehlt hier NICHT mehr mit
         -- (Max 2026-09-20: "Geaendert darf nicht heissen durch uns angereichert, sondern dass
         -- die Quelle das physisch aendert") — dieselbe Stelle unter neuer ID ist keine
         -- Sachaenderung. Die Rotationszahl bleibt als roh.rotationAlsGeaendert sichtbar.
         kat AS (
           SELECT kategorie, 'neu' AS typ, count(*) AS n FROM relevant_neu GROUP BY 1
           UNION ALL SELECT kategorie, weg_typ, count(*) FROM relevant_weg GROUP BY 1, 2
           UNION ALL SELECT kategorie, 'geaendert', count(*)
             FROM obstacle_aenderungen WHERE ${relevantFilter} GROUP BY 1
         ),
         strasse AS (
           SELECT ${STRASSENKLASSE_CASE} AS klasse, 'neu' AS typ, count(*) AS n FROM relevant_neu GROUP BY 1
           UNION ALL SELECT ${STRASSENKLASSE_CASE} AS klasse, weg_typ, count(*) FROM relevant_weg GROUP BY 1, weg_typ
           UNION ALL SELECT ${STRASSENKLASSE_CASE_AENDERUNG} AS klasse, 'geaendert', count(*)
             FROM obstacle_aenderungen WHERE ${relevantFilter} GROUP BY 1
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
           FROM final_neu GROUP BY 1
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
           FROM final_neu GROUP BY 1
         ),
         roh AS (
           SELECT
             (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1)
                AND created_at >= current_date - $2::int * interval '1 day') AS neu,
             (SELECT count(*) FROM obstacles WHERE demo=false AND kategorie=ANY($1) AND aktiv=false
                AND updated_at >= current_date - $2::int * interval '1 day') AS weggefallen,
             (SELECT count(*) FROM obstacles o WHERE o.demo=false AND o.kategorie=ANY($1)
                AND o.created_at >= current_date - $2::int * interval '1 day'
                AND o.created_at::date < (SELECT qs.zaehlt_ab FROM quelle_start qs
                                           WHERE qs.quellen_id = o.quellen_id)) AS erstbefuellung_neuer_quellen,
             -- Zeilen aus Befuellungstagen ETABLIERTER Quellen (Umbau/Neueinlesen) — Beleg dafuer,
             -- wie viel die Regel oben aus "neu" herausnimmt.
             (SELECT count(*) FROM obstacles o WHERE o.demo=false AND o.kategorie=ANY($1)
                AND o.created_at >= current_date - $2::int * interval '1 day'
                AND o.created_at::date >= (SELECT qs.zaehlt_ab FROM quelle_start qs
                                            WHERE qs.quellen_id = o.quellen_id)
                AND EXISTS (SELECT 1 FROM befuellungstag bt
                             WHERE bt.quellen_id = o.quellen_id AND bt.tag = o.created_at::date)) AS befuellung_ausgeklammert,
             (SELECT count(*) FROM vorgang_rotation) AS rotation_als_geaendert,
             (SELECT count(*) FROM echte_neu) - (SELECT count(*) FROM vorgang_neu) AS segmente_zusammengefasst,
             (SELECT count(*) FROM rotation_neu) - (SELECT count(*) FROM vorgang_rotation) AS rotation_vorgaenge_zusammengefasst,
             (SELECT count(*) FROM vorgang_neu) - (SELECT count(*) FROM final_neu) AS familie_dubletten_neu,
             (SELECT count(*) FROM vorgang_weg) - (SELECT count(*) FROM final_weg) AS familie_dubletten_weg,
             (SELECT count(*) FROM final_neu) - (SELECT count(*) FROM relevant_neu) AS relevanz_ausgeklammert_neu,
             (SELECT count(*) FROM final_weg) - (SELECT count(*) FROM relevant_weg) AS relevanz_ausgeklammert_weg,
             -- NUR der obstacle_aenderungen-Anteil: die Quellen-Rotation zaehlt seit dem 20.09.
             -- (dba94f5) ueberhaupt nicht mehr als "geaendert" und kann deshalb auch nicht daraus
             -- ausgeklammert werden. Der alte Summand zaehlte sie trotzdem mit und wies damit mehr
             -- ausgeklammerte Aenderungen aus, als es ueberhaupt gab.
             (SELECT count(*) FROM obstacle_aenderungen WHERE ${geaendertFilter})
               - (SELECT count(*) FROM obstacle_aenderungen WHERE ${relevantFilter}) AS relevanz_ausgeklammert_geaendert,
             -- SELBSTKONTROLLE DER METRIK (T-749). Eine Aenderung ist ein EREIGNIS: sie passiert
             -- einmal. Meldet die Metrik dieselbe Zeile Tag fuer Tag, misst sie keinen Vorgang,
             -- sondern bewertet bei jedem Lauf denselben Zustand neu — und ist damit kaputt,
             -- egal wie plausibel die Einzelwerte aussehen. Genau diese drei Zahlen haben den
             -- Fehler vom 21.09. aufgedeckt (800 heute, 635 gestern, 615 davon dieselben Zeilen),
             -- bevor ein einziges Feld analysiert war. Sie stehen deshalb dauerhaft im Payload,
             -- nicht in einem Diagnose-Skript: der Worker schlaegt daraus Alarm (worker/index.js,
             -- meldeTrackingGuete) und die Seite weist sie als Beleg aus.
             (SELECT count(*) FROM obstacle_aenderungen WHERE erkannt_am = current_date) AS geaendert_heute,
            -- Fuer die Selbstkontrolle (T-760): kippt EIN Connector, sieht das weder die
            -- Wiederholungs- noch die Mengenschwelle.
            (SELECT coalesce(max(n), 0) FROM (
               SELECT count(*) AS n FROM obstacle_aenderungen
                WHERE erkannt_am = current_date GROUP BY quellen_id) q) AS geaendert_heute_groesste_quelle,
             (SELECT count(*) FROM obstacle_aenderungen WHERE erkannt_am = current_date - 1) AS geaendert_gestern,
             (SELECT count(*) FROM (
                SELECT obstacle_id FROM obstacle_aenderungen WHERE erkannt_am = current_date
                INTERSECT
                SELECT obstacle_id FROM obstacle_aenderungen WHERE erkannt_am = current_date - 1
              ) w) AS wiederholt_vom_vortag
         )
         SELECT
           (SELECT json_agg(zr ORDER BY tag) FROM zr) AS zeitreihe,
           (SELECT json_agg(kat) FROM kat) AS kategorien,
           (SELECT json_agg(strasse) FROM strasse) AS strassenklassen,
           (SELECT json_object_agg(laufzeit, n) FROM lz) AS laufzeiten,
           (SELECT json_object_agg(vorlauf, n) FROM vl) AS vorlaufzeiten,
           (SELECT row_to_json(roh) FROM roh) AS roh,
           (SELECT min(erkannt_am) FROM obstacle_aenderungen) AS geaendert_seit,
           (SELECT greatest(min(updated_at)::date, current_date - 120)
              FROM obstacles
             WHERE aktiv = false AND tenant_id IS NULL AND quellen_id IS NOT NULL) AS erfassung_vollstaendig_ab`,
    params,
  )

  const { rows: belegRows } = await db.query(
    `SELECT a.erkannt_am::text AS tag, a.quellen_id, a.strassen_ref, a.aenderung, o.name
       FROM obstacle_aenderungen a
       JOIN obstacles o ON o.id = a.obstacle_id
      WHERE a.aenderung IS NOT NULL
        AND a.kategorie = ANY($1)
        AND a.erkannt_am >= current_date - $2::int * interval '1 day'
        AND a.gueltig_von IS NOT NULL
        AND (a.gueltig_bis IS NULL OR a.gueltig_bis - a.gueltig_von > 30)
      ORDER BY a.erkannt_am DESC, a.created_at DESC
      LIMIT 25`,
    [kategorien, tage],
  )
  const belege = belegRows.map((b) => ({
    tag: b.tag, quellenId: b.quellen_id, strassenRef: b.strassen_ref,
    name: b.name, aenderung: b.aenderung,
  }))

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

  // Grundgesamtheit fuer die Kopfzeile (Max 2026-09-20: "kurz einordnen, was die
  // Grundgesamtheit ist"). Bewusst aus den Daten gezaehlt statt im Frontend hartkodiert --
  // eine Zahl, die nicht aus dem Bestand kommt, waere in einem Auswertungswerkzeug das
  // Schlechteste. Separate, billige Abfrage: ein Index-Scan auf obstacles, kein Join.
  const { rows: [basis] } = await db.query(
    `SELECT count(DISTINCT quellen_id)::int AS quellen, count(*)::int AS hindernisse
       FROM obstacles WHERE demo = false AND aktiv = true AND kategorie = ANY($1)`,
    [kategorien],
  )

  return {
    tage,
    kategorien,
    quellenBasis: {
      quellen: Number(basis?.quellen ?? 0),
      hindernisse: Number(basis?.hindernisse ?? 0),
    },
    geaendertTrackingSeit: row.geaendert_seit ?? null,
    erfassungVollstaendigAb: row.erfassung_vollstaendig_ab
      ? String(row.erfassung_vollstaendig_ab).slice(0, 10) : null,
    zeitreihe,
    gesamt: { neu: summe("neu"), geaendert: summe("geaendert"), ausgelaufen: summe("ausgelaufen"), entfernt: summe("entfernt") },
    // Rohzahlen vor der Aufteilung — Beleg, kein Versteck.
    roh: {
      neu: Number(row.roh?.neu ?? 0),
      weggefallen: Number(row.roh?.weggefallen ?? 0),
      erstbefuellungNeuerQuellen: Number(row.roh?.erstbefuellung_neuer_quellen ?? 0),
      /** Zeilen aus Befuellungstagen bestehender Quellen (Umbau, Neueinlesen) — zaehlen nicht
       *  als "neu", weil sie kein Ereignis der Behoerde sind. */
      befuellungAusgeklammert: Number(row.roh?.befuellung_ausgeklammert ?? 0),
      // War in "roh.neu" enthalten und ist dort raus: dieselbe reale Stelle unter neuer Quell-ID
      // ist keine Neuanlage. Sie ist aber AUCH keine Aenderung (Max 2026-09-20) und steckt seit
      // dba94f5 in KEINER der vier Kopfzahlen — diese Zahl ist reiner Beleg dafuer, wie viel
      // Rotation im Fenster steckte, bereits auf Vorgangs-Ebene zusammengefasst
      // (siehe rotationVorgaengeZusammengefasst).
      rotationAlsGeaendert: Number(row.roh?.rotation_als_geaendert ?? 0),
      // Zeilen, die zu einem bereits gezählten Vorgang gehören (Segmente/Rotationen desselben
      // Namens) — steckt in "neu" NICHT mehr drin, seit "neu" Vorgänge statt Zeilen zählt.
      segmenteZusammengefasst: Number(row.roh?.segmente_zusammengefasst ?? 0),
      // Rotations-TREFFER (Zeilen), die zu einer bereits gezählten Rotations-Vorgang gehören —
      // z.B. dieselbe Baustelle, deren externe_id sich innerhalb des Fensters mehrfach ändert
      // (Max 18.09.: "35.137 kann ich mir kaum vorstellen, fasse zusammen"). rotationAlsGeaendert
      // oben ist bereits NACH diesem Zusammenfassen.
      rotationVorgaengeZusammengefasst: Number(row.roh?.rotation_vorgaenge_zusammengefasst ?? 0),
      // Vorgänge, die eine ANDERE Quelle derselben Familie (aktuell Autobahn GmbH: 0001/0145/0152)
      // bereits gemeldet hat — gleicher strassen_ref, geografisch nah, Gültigkeit überlappend.
      // Steckt weder in "neu" noch in "geaendert", ist einfach raus (Dublette, kein Ereignis).
      familieDublettenNeu: Number(row.roh?.familie_dubletten_neu ?? 0),
      familieDublettenWeg: Number(row.roh?.familie_dubletten_weg ?? 0),
      // Relevanz-Filter (T-748, Max: "nur relevante Änderungen, nicht Kleinscheiß"): "kurz"/
      // "mittel" laufende Vorgänge (≤30 Tage) zählen nicht mehr in gesamt.neu/geaendert/
      // ausgelaufen/entfernt — bleiben aber vollständig sichtbar im Laufzeit-Chart (laufzeiten
      // unten zeigt ALLE Vorgänge, nicht nur die relevanten).
      relevanzAusgeklammertNeu: Number(row.roh?.relevanz_ausgeklammert_neu ?? 0),
      relevanzAusgeklammertWeg: Number(row.roh?.relevanz_ausgeklammert_weg ?? 0),
      relevanzAusgeklammertGeaendert: Number(row.roh?.relevanz_ausgeklammert_geaendert ?? 0),
      geaendertHeuteGroessteQuelle: Number(row.roh?.geaendert_heute_groesste_quelle ?? 0),
      // Selbstkontrolle (T-749): wie viele der heutigen Aenderungen betrafen dieselbe Zeile wie
      // gestern? Ein Ereignis wiederholt sich nicht. Siehe Kommentar an der SQL oben.
      geaendertHeute: Number(row.roh?.geaendert_heute ?? 0),
      geaendertGestern: Number(row.roh?.geaendert_gestern ?? 0),
      wiederholtVomVortag: Number(row.roh?.wiederholt_vom_vortag ?? 0),
    },
    proKategorie: kat,
    proStrassenklasse: strasse,
    laufzeiten: row.laufzeiten ?? {},
    vorlaufzeiten: row.vorlaufzeiten ?? {},
    // Die letzten Aenderungen im Klartext (T-760, Max: "systematisch tracked wenn solche
    // beispiele kommen das selbe baustelle anders behandelt wird"). Eine Kopfzahl ohne Belege
    // laesst sich nicht pruefen — genau deshalb fiel erst Max auf, dass 381 nicht stimmen kann.
    // Eigene, billige Abfrage: die grosse Query oben braucht schon ~55 s.
    belege,
  }
}

// Cache-first (T-747-Nachbesserung, 18.09., Max: "einmal morgens alle Daten ready, das ist nur
// noch Visu"): berechneUebersicht braucht ~55s (Anti-Join gegen den vollen Bestand), das darf
// kein Seitenaufruf live tragen. Der Worker fuellt veraenderungen_cache taeglich frueh morgens
// (runVeraenderungenCache). Cache-Miss (vor dem ersten Cron-Lauf, oder ein `tage`-Wert, den der
// Cron nicht vorrechnet) faellt live zurueck UND schreibt das Ergebnis gleich in den Cache, statt
// jeden weiteren Aufruf erneut ~55s warten zu lassen.
export function veraenderungenRouter({ db }) {
  const r = Router()

  // Kein requireRole mehr: die Auswertung steht seit 2026-09-20 JEDEM angemeldeten Nutzer
  // offen (Max: "die Rolle darf auch JEDER im System haben"). Authentifizierung bleibt, die
  // gilt global fuer /api (app.js: authMiddleware). Ohne diese Lockerung liefe das offene
  // Frontend in einen 403 — die Seite waere sichtbar, aber leer.
  r.get("/uebersicht", asyncHandler(async (req, res) => {
    const tage = Math.min(TAGE_MAX, Math.max(1, Number.parseInt(req.query.tage, 10) || TAGE_DEFAULT))

    const { rows: [cached] } = await db.query(
      "SELECT payload, berechnet_am FROM veraenderungen_cache WHERE tage = $1",
      [tage],
    )
    if (cached) {
      res.json({ ...cached.payload, berechnetAm: cached.berechnet_am })
      return
    }

    const payload = await berechneUebersicht(db, tage)
    const berechnetAm = new Date()
    await db.query(
      `INSERT INTO veraenderungen_cache (tage, payload, berechnet_am) VALUES ($1, $2, $3)
       ON CONFLICT (tage) DO UPDATE SET payload = excluded.payload, berechnet_am = excluded.berechnet_am`,
      [tage, JSON.stringify(payload), berechnetAm],
    )
    res.json({ ...payload, berechnetAm })
  }))

  return r
}
