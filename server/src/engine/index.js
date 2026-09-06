// Analyse-Engine v2: pro Projekt-Route (routes[]) Hindernisse im Korridor matchen
// → Regelwerk anwenden → Ergebnis transaktional persistieren (Findings ersetzen,
// Projekt updaten). EINE Gesamt-Auswertung über alle Strecken; jeder Fund kennt
// seine Route (routeId/routeName) und seine km-Position auf SEINER Route.
//
// Der Legacy-startziel-Pfad (resolveRoute.js inkl. OSRM/Nominatim-Kaskade) bleibt
// im Code, wird vom FE aber nicht mehr erzeugt — Routen kommen als Punktlisten.

import { rowToObstacle } from "../map.js"
import { BATCH_ROWS, chunk, placeholders } from "../dbBatch.js"
import { OBSTACLE_COLS } from "../obstaclesRepo.js"
import { downsample } from "./fallback.js"
import {
  bboxWithBuffer, buildRouteGrid, clipGeomToCorridor, coincidentRouteKm, cumulativeKm, geomLineParts, haversineKm, lineCrossesRoute, lineOffRoute, nearestOnRoute, obstacleRouteRelation, totalKm,
} from "./geometry.js"
import { AUSWERTUNG_AUSGESCHLOSSEN, evaluate } from "./rules.js"
import {
  kreuztKeineStrasse,
  normRoadRef,
  normRoadRefWeit,
  normStrassenName,
  strasseAusName,
} from "../external/osrm.js"
import { ladeAnreicherung, mitAnreicherung, anreicherungsVermerk, kiZeilen } from "../anreicherung/lesen.js"
import { kiFelderJePunkt } from "../anreicherung/einspielen.js"
import { ApiError, isFiniteNumber } from "../util.js"

// 2.1.0 (T-603): SEVAS-Kreuzungsfilter (coincidentRouteKm + Parallelität), Klon-Dedup (identische
// Geom), Orphan-Funde-Purge. Materielle Engine-Änderung → Version-Bump markiert sie in analysis_runs.
// 2.2.0 (T-611): allgemeiner Kreuzungsfilter (lineCrossesRoute) für ALLE Linien-Meldungen — quer
// kreuzende Baustellen/Sperrungen an Autobahndreiecken/-kreuzen + kreuzende K-/L-Straßen raus
// (richtungsbasiert, längs-versetzte bleiben). Systemweit −12 Querlinien (3 Falsch-Kritische).
// 2.2.1 (T-611 Audit R3, Welle 1): humanizeTitel erweitert — Uf/UF→Unterführung, Üf/ÜF→Überführung,
// BASt-Stationscodes „Ab/St" raus (Staatsstraße geschützt), A#/A#-NearDup-Collapse, //-Mehrsegment.
// 2.2.2 (T-611 Welle A, Falsch-Kritische): VZ263 Achslast→maxAchslastT (kein Gesamtgewicht-Falsch-
// Kritisch), Rampen-/Auf-Abfahrt-Sperrung ohne vollsperrung (0001/0156), „Vollsperrung (Querstraße)"
// bei halbseitiger Hauptmaßnahme nicht als Vollsperrung werten.
// 2.3.0 (T-611 Welle B+C): dominierte-Restbreite-Dedup (gleiche Route+km+Zeit, breitere raus),
// Geh-/Radweg-Vollsperrung + Vollsperrung-mit-0-Fahrstreifen+Rampe nicht mehr kritisch, „;"-Titel-Trim.
// 2.3.1 (T-611 Voll-Bestand): humanizeTitel auch auf der Hindernis-DB-Karte (alle 55k), „(DATEX)"-Strip
// + Erstbuchstabe groß. Bisher liefen die kryptischen Roh-Titel (HDF_/DATEX/Ab-St/VZ) nur durch Funde.
// 2.3.2 (T-611 Voll-Bestand-Fixes): „Gesamtmaßnahme"-Datum nicht als gueltigBis (Nacht-Sperrung-Falsch-
// Kritisch 0001); roadClosed schlägt Geh-/Radweg-Entschärfung (0142); tonnage „Verbot über X t"=Limit
// (0127/0130 FN) aber Überholverbot nicht; maxGewichtT/restbreiteM-Cross-Gap-Fill-Ausschluss (0221/0157);
// DATEX-Richtungs-Enum→Deutsch; Reaktivierung abgelaufener Hindernisse gestoppt; VST_/EF_/ZM_-Codes.
// 2.3.3 (T-611 Beauty): humanizeTitel — ALL-CAPS-Kataster-Namen → deutsche Schreibung (BASt 0153),
// ÜFG/UEF→Überführung/EÜ→Eisenbahnüberführung, km-/Datum-/Uhrzeit-Tails strippen (0147/0153), nur-Junk-
// Titel → Kategorie-Default. 11.668/54.713 Titel verschönert, 0 geleert. EVB/3-Buchstaben-Kürzel geschützt.
// 2.3.4 (T-611 Beauty): Detail-WERTE großschreiben („gesperrt"→„Gesperrt", „auflagenpflichtig…"→„Auf…");
// Gültigkeits-Label „unbefristet/ab/bis" groß (FE+Mail). Zahlen/Einheiten unverändert.
// 2.4.0 (T-641): Abseits-Filter (lineOffRoute) — Linien-Meldungen, die die Route nur tangential
// berühren (nicht befahrene AS-/Kreuz-Rampen, benachbarte Fremdstraßen), werden ausgesiebt: kein
// gleichgerichteter Mitlauf im Korridor (< 35 m) UND ≥ 120 m der Linie klar abseits (> 60 m);
// je MultiLineString-TEIL-Linie gerechnet (keine Phantom-Sprungsegmente). Kalibriert an allen 1334
// Prod-Linien-Funden + adversarialer Review (17 Agenten): 54 Drops, Schwellen mittig in den Daten-
// Lücken zu allen identifizierten echten Grenzfällen (A28-Versatz, B31a-Ziel-Sperrung, AS Bühl).
export const ENGINE_VERSION = "2.4.0"

// Überführungen (T-601, seit T-653 als Zuordnungsnachweis): BASt-/Last-Brücken sind Punkte ohne
// eigene Geometrie und sitzen geometrisch AUF der Autobahn. Maßgeblich ist, welche Straße das
// Bauwerk trägt und welche es kreuzt (BASt hoechst_sachverhalt_oben/-unten). Das Urteil fällt
// jetzt in zuordnung() weiter unten, ortsbezogen statt gegen die ganze Route, und mit drei
// Ausgängen statt zwei. Die Namensheuristik von T-601 ist aus dem Löschpfad heraus: gemessen
// 0 richtige und 10 falsche Verwerfungen.
const ROAD_ALL = /\b(a|b|l|k|st|s)\s?0*(\d{1,4})\b/gi
function roadRefsIn(s) {
  const out = []
  for (const m of String(s ?? "").toLowerCase().matchAll(ROAD_ALL)) {
    const p = m[1].toUpperCase()
    out.push((p === "S" ? "ST" : p) + m[2])
  }
  return out
}
const intersects = (refs, set) => refs.some((r) => set.has(r))

/** Wie weit um die Fundstelle herum gilt eine Strassenzuordnung noch (Meter). 400 m deckt einen
 *  Autobahnknoten samt Rampen ab, ohne dass eine Beruehrung am anderen Ende der Route mitredet. */
export const LOKAL_FENSTER_M = 400

/**
 * Die km-Spannen, in denen die Route auf einer bestimmten Strasse faehrt (T-653).
 *
 * WOZU: `refs` ist eine flache Menge ueber die GANZE Route. Faehrt eine Route A7 und A2, gilt damit
 * die Bruecke "AK Hannover-Ost, A7 ueber A2" als befahren, egal wo sie liegt. Gemessen: 12 solcher
 * Funde in vier Projekten. Mit Spannen laesst sich stattdessen fragen, was wir HIER fahren.
 *
 * Jeder OSRM-Schritt wird auf seinen km-Bereich auf unserer Route projiziert. Es genuegen erster
 * und letzter Punkt: ein Schritt laeuft entlang der Route, seine Enden spannen ihn also auf.
 */
export function strassenSpannenBauen(abschnitte, geometry, cum, grid) {
  if (!Array.isArray(abschnitte) || !abschnitte.length) return []
  const raus = []
  for (const a of abschnitte) {
    const p = a?.punkte
    // Ref ODER Name: seit dem 01.09.2026 fuehren die Spannen auch benannte Gemeindestrassen mit,
    // sonst kann die Zuordnung ueber sie nichts sagen (siehe abschnitteAusLegs).
    if ((!a?.ref && !a?.name) || !Array.isArray(p) || p.length === 0) continue
    const erst = nearestOnRoute(p[0], geometry, cum, grid)
    const letzt = nearestOnRoute(p[p.length - 1], geometry, cum, grid)
    if (!Number.isFinite(erst?.km) || !Number.isFinite(letzt?.km)) continue
    raus.push({ ref: a.ref ?? null, name: a.name ?? null, vonKm: Math.min(erst.km, letzt.km), bisKm: Math.max(erst.km, letzt.km) })
  }
  return raus.sort((x, y) => x.vonKm - y.vonKm)
}

/**
 * Welche Strassen faehrt die Route rund um diesen Kilometer? Leeres Set heisst "keine Auskunft",
 * NICHT "keine Strasse" — der Aufrufer muss beides unterscheiden, sonst wird aus Unwissen ein Urteil.
 */
export function strassenBeiKm(spannen, km, fensterM = LOKAL_FENSTER_M) {
  const raus = new Set()
  if (!Array.isArray(spannen) || !spannen.length || !Number.isFinite(km)) return raus
  const rand = fensterM / 1000
  // Binaersuche auf den ersten Abschnitt, der noch hineinragen kann. Die Spannen sind nach vonKm
  // sortiert, ab dem ersten Treffer genuegt ein Vorwaertslauf bis der naechste jenseits liegt.
  let lo = 0
  let hi = spannen.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (spannen[mid].bisKm < km - rand) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < spannen.length && spannen[i].vonKm <= km + rand; i++) {
    // Nur Refs. Abschnitte ohne Nummer tragen seit dem 01.09.2026 einen Namen und wuerden hier
    // sonst ein null ins Set legen — und null im Set hiesse "wir kennen eine Strasse namens null".
    if (spannen[i].bisKm >= km - rand && spannen[i].ref) raus.add(spannen[i].ref)
  }
  return raus
}

/**
 * Dasselbe fuer benannte Strassen. Getrennt von den Refs, weil beide Vergleiche verschieden
 * verlaesslich sind: eine Strassennummer ist eindeutig, ein Name kann in zwei Orten derselbe sein.
 * Wer beides in einen Topf wirft, kann hinterher nicht mehr sagen, worauf ein Urteil beruhte.
 */
export function namenBeiKm(spannen, km, fensterM = LOKAL_FENSTER_M) {
  const raus = new Set()
  if (!Array.isArray(spannen) || !spannen.length || !Number.isFinite(km)) return raus
  const rand = fensterM / 1000
  for (const s of spannen) {
    if (s.name && s.vonKm <= km + rand && s.bisKm >= km - rand) raus.add(s.name)
  }
  return raus
}

/**
 * Was wissen wir ueber die Zuordnung dieses Bauwerks zu DIESER Strecke (T-653)?
 *
 * Max, 31.08.2026: "wir bekommen immer Ueberfuehrungen in die Auswertungen, obwohl wir drunter
 * durchfahren" und "das Kreuzende geht halt nicht immer, weil die Liniengeometrie nicht oder
 * falsch ist. Da muessen wir uns einen generellen Fix ueberlegen."
 *
 * DER UMSCHWUNG: nicht mehr "ist dieses Hindernis quer zu mir" (das braucht seine Geometrie, und
 * genau die fehlt oder luegt), sondern "fahre ich AN DIESER STELLE auf der Strasse, zu der es
 * gehoert". Diese Frage beantwortet unsere eigene Route, nicht die Quelle.
 *
 * Drei Antworten statt zwei, und nur eine davon loescht:
 *   "widerlegt"   — belegt, dass es uns nicht gilt. Nur die autoritative BASt-Aussage darf das.
 *   "bewiesen"    — belegt, dass es uns gilt.
 *   "unbestimmt"  — wir wissen es nicht. Wird gezeigt und gekennzeichnet, NICHT geloescht.
 *
 * WARUM DIE NAMENSHEURISTIK NICHT MEHR LOESCHT: gemessen ueber 23 Projekte und 4.668 Korridor-
 * Treffer erzeugte sie 0 richtige und 10 falsche Verwerfungen, Praezision 0. Sie fiel auf
 * "Ueberholspur", "Ueberleitung zur A3" und "zwischen B85 und K...". Sie darf hoechstens noch
 * "unbestimmt" begruenden.
 *
 * WARUM getragen !== gekreuzt: bei 129 Bauwerken und 55 Funden traegt die Quelle in BEIDEN Feldern
 * dieselbe Strasse ("UEF DER VERBINDUNGSRAMPE UEBER DIE B 90", oben B90, unten B90). Der Grund
 * liegt im Connector (0153_bast_bruecken.js refAus nimmt den ersten Strassen-Treffer je Feld).
 * Zwei gleiche Werte sind keine Oben-Unten-Aussage, sondern eine kaputte, und aus einer kaputten
 * Angabe darf kein Loeschen folgen.
 */
/** Nur Bruecken und Tunnel koennen ueber oder unter uns liegen. Alles andere liegt AUF der
 *  Strasse, dort stellt sich die Frage nicht. */
export const istBauwerk = (o) => o?.kategorie === "bruecke" || o?.kategorie === "tunnel"

export function zuordnung(obstacle, ctx, km) {
  const attrs = obstacle?.attrs ?? {}
  // Das lokale Fenster entscheidet, WENN es etwas weiss. Ist es leer, hat OSRM fuer dieses Stueck
  // keine Strassennummer geliefert (Ortsdurchfahrt, Rampe, unbenannte Gemeindestrasse), und ein
  // leeres Fenster heisst "keine Auskunft", nicht "andere Strasse". Dann faellt die Frage auf die
  // Gesamtliste zurueck, also auf genau das Verhalten von vorher. Gemessen: ohne diesen Rueckfall
  // rutschten 11 eindeutige Ueberfuehrungen ("Uef K10 ueber A27") von "widerlegt" auf
  // "unbestimmt" und blieben stehen. Der Ortsbezug soll den globalen Vergleich praezisieren,
  // nicht ihn dort ersetzen, wo er gar nichts sagen kann.
  const fenster = strassenBeiKm(ctx?.strassenSpannen, km)
  const lokal = fenster.size > 0 ? fenster : (ctx?.refs ?? fenster)
  const getragen = normRoadRef(attrs.getrageneStrasse)
  const gekreuzt = normRoadRef(attrs.gekreuzteStrasse)

  // Eine reine Durchfahrtshoehe SAGT bereits "du faehrst drunter durch" und ist damit genau dann
  // richtig, wenn wir drunter durchfahren. Gemessen: 12.335 solcher Bauwerke, und KEIN einziges
  // traegt gleichzeitig eine getragene Strasse. Die Herkunft trennt die Lage hier also schon, und
  // wir duerfen sie nicht gegen eine Oben-Unten-Regel laufen lassen, die es gar nicht braucht.
  if (attrs.maxHoeheM != null && attrs.maxGewichtT == null) return "bewiesen"

  // Sind BEIDE Felder gesetzt und gleich, ist die Angabe kaputt und taugt zu gar nichts (129
  // Bauwerke im Bestand, Ursache im Connector). Dann wird sie ganz ignoriert, statt daraus ein
  // Urteil in die eine oder andere Richtung abzuleiten.
  const brauchbar = getragen == null || gekreuzt == null || getragen !== gekreuzt
  const obenGefahren = brauchbar && getragen != null && lokal.has(getragen)
  const untenGefahren = brauchbar && gekreuzt != null && lokal.has(gekreuzt)

  // Steht kein Strukturfeld da (12.976 von 16.278 Bauwerken), traegt der NAME die Lage. Gegen die
  // Bauwerke mit Strukturfeld nachgemessen: sagt der Name etwas, stimmt es in 94 Prozent, und ein
  // Teil des Rests sind Faelle, in denen der Name genauer ist als die Quelle.
  //
  // Widersprechen sich beide Quellen, wird NICHT verworfen. Beleg: "AK Hannover-Ost, A 7 ueber
  // A 2" traegt im Strukturfeld oben=A2, der Name sagt eindeutig A7. Ohne diese Pruefung fiele
  // eine Bruecke weg, ueber die wir tatsaechlich fahren.
  const ausName = strasseAusName(obstacle?.name)
  const obenWeit = normRoadRefWeit(attrs.getrageneStrasse) ?? ausName.oben
  const quellenWidersprechen =
    normRoadRefWeit(attrs.getrageneStrasse) != null && ausName.oben != null &&
    normRoadRefWeit(attrs.getrageneStrasse) !== ausName.oben

  // Fahren wir hier auf der gekreuzten Strasse, liegt das Bauwerk ueber uns, wir belasten es nie.
  // Die gekreuzte Strasse allein genuegt dafuer: viele Bauwerke nennen NUR sie ("Ueberfuehrung
  // Wirtschaftsweg ueber die A5"), und wer den Wirtschaftsweg traegt, interessiert uns nicht.
  // Nachgemessen: ohne diesen Zweig blieben genau solche Ueberfuehrungen stehen.
  if (untenGefahren && !obenGefahren) return "widerlegt"

  // DASSELBE URTEIL AUS DEM NAMEN, wenn das Strukturfeld nichts hergibt. Sagt der Name
  // "Ueberfuehrung X ueber A1" und wir fahren hier die A1, liegt das Bauwerk ueber uns —
  // unabhaengig davon, was die Quelle in ihre beiden Felder geschrieben hat.
  //
  // Der Zweig oben erreicht diese Faelle nicht: bei ihnen ist getragen == gekreuzt, also
  // `brauchbar` false und `untenGefahren` damit immer false. Gemessen am 05.09.2026 gegen die
  // 1.593 Bruecken-Warnungen der Produktion: 43 Treffer, ALLE mit genau dieser kaputten
  // Feldangabe ("Uef Gemeindestr. ueber A1", "UEF eines Wanderweges ueber die A9").
  //
  // Die Gegenprobe ist die teure Richtung und deshalb Bedingung: nennt der Name oben eine
  // Strasse, die wir hier AUCH fahren (Autobahnkreuz), bleibt der Fund. Gemessen blieben so
  // 558 Bauwerke stehen, ueber die wir tatsaechlich fahren ("Bruecke A73 ueber den Entlesbach").
  //
  // `fenster` und NICHT `lokal`: der globale Rueckfall darf hier so wenig einspringen wie beim
  // Umkehrschluss weiter unten. Sonst wuerde aus einer Luecke in unseren eigenen Streckendaten
  // ein Loeschurteil, und genau dagegen steht der Grundsatz aus T-653, dass die Namenslesung
  // allein nichts verwerfen darf. Mit dem Ortsbezug davor darf sie es, ohne ihn nicht.
  if (
    fenster.size > 0 && ausName.unten != null && fenster.has(ausName.unten) &&
    !(ausName.oben != null && fenster.has(ausName.oben))
  ) return "widerlegt"

  // Fahren wir auf der getragenen, sind wir oben drauf. Die Tragfaehigkeit gilt uns.
  if (obenGefahren) return "bewiesen"

  // UMKEHRSCHLUSS: die getragene Strasse ist bekannt, und an DIESER Stelle fahren wir sie nicht.
  // Dann fahren wir nicht ueber das Bauwerk, seine Tragfaehigkeit geht uns nichts an.
  //
  // Diese Regel ist die scharfe, deshalb drei Bedingungen davor:
  //  - das lokale Fenster muss GEFUELLT sein. Der globale Rueckfall genuegt hier NICHT: er wuerde
  //    aus einer Luecke in unseren eigenen Streckendaten ein Urteil machen, und gemessen gingen
  //    25 von 34 Abweichungen genau darauf zurueck.
  //  - die Quellen duerfen sich nicht widersprechen (siehe oben).
  //  - die gekreuzte Strasse darf nicht dieselbe sein (kaputte Angabe).
  // Gemessen an 1.915 Bauwerks-Kandidaten aus 40 Projekten: 16 Verwerfungen, alle nachgeprueft
  // plausibel, darunter "Bruecke K BA 10" auf einer A70-Route und "AD Sinzig-UEF A571" auf der A61.
  if (fenster.size > 0 && obenWeit != null && !quellenWidersprechen && !fenster.has(obenWeit)) {
    return "widerlegt"
  }
  // Die eigene Strassenangabe taugt als Nachweis nur fuer Hindernisse, die AUF der Strasse liegen.
  // Bei einem Bauwerk sagt sie lediglich "ich liege an der A5" und laesst offen, ob wir darueber
  // oder darunter fahren; als Beweis genommen erklaerte sie jede Ueberfuehrung ueber unsere
  // Fahrbahn zu unserer eigenen. Fuer Bruecken und Tunnel gilt sie deshalb NICHT.
  // Widerlegen darf sie ohnehin nie: 25 von 34 gemessenen Abweichungen gingen auf Luecken in
  // unseren eigenen Refs zurueck, nicht auf die Quelle.
  const eigen = normRoadRef(obstacle?.strassenRef ?? obstacle?.strassen_ref)
  if (!istBauwerk(obstacle) && eigen != null && lokal.has(eigen)) return "bewiesen"

  // BENANNTE STRASSEN (01.09.2026). Max an einem Fund "Durchfahrt verboten · Sandbochumer Weg",
  // der mitten in einer Auswertung stand, obwohl die Route dort nicht entlangfuehrt: "muesste doch
  // klar sein, dass es auf dem Sandbochumer Weg liegt und damit ausgeblendet sein."
  //
  // Bis hierher konnte die Engine dazu nichts sagen: sie kannte nur klassifizierte Nummern, und
  // "Sandbochumer Weg" ist keine. Der Fund blieb "unbestimmt" und damit stehen.
  //
  // VIER BEDINGUNGEN, weil ein Name weniger wert ist als eine Nummer:
  //  - nur fuer Hindernisse AUF der Strasse, nie fuer Bauwerke (dort sagt die Strassenangabe
  //    nichts darueber, ob wir oben oder unten fahren)
  //  - das Hindernis darf KEINE verwertbare Nummer tragen; hat es eine, ist sie das bessere
  //    Kriterium und wurde oben schon geprueft
  //  - die Route muss an dieser Stelle ueberhaupt Namen kennen, sonst ist Schweigen kein Urteil
  //  - der Name muss lang genug sein, um zu unterscheiden (normStrassenName verwirft Kurzformen)
  const eigenName = normStrassenName(obstacle?.strassenRef ?? obstacle?.strassen_ref)
  if (!istBauwerk(obstacle) && eigen == null && eigenName != null) {
    const namen = namenBeiKm(ctx?.strassenSpannen, km)
    if (namen.has(eigenName)) return "bewiesen"
    // Max, 01.09.2026: "auch wenn ich nicht Hausnummer und so weiss, weiss ich ja, dass wenn es
    // auf dem Sandbochumer Weg liegt, es NICHT auf der AUTOBAHN liegt."
    //
    // Das ist der schaerfere Schluss, und er stimmt: WISSEN wir, worauf die Strecke hier laeuft —
    // sei es ueber eine Nummer (A1) oder einen Namen —, und das Hindernis gehoert zu einer
    // benannten Strasse, die nicht dabei ist, dann fahren wir sie an dieser Stelle nicht.
    // Es genuegt also, dass die Route ihre eigene Strasse kennt; sie muss nicht ausgerechnet
    // Namen kennen.
    //
    // Das leere Fenster bleibt stumm: kennt die Route hier WEDER Nummer NOCH Name, ist das
    // Unwissen und kein Gegenbeweis — dieselbe Regel wie oben bei den Nummern, und dieselbe
    // Lehre aus den 25 von 34 Fehlverwerfungen im August.
    if (fenster.size > 0 || namen.size > 0) return "widerlegt"
  }

  // WAS UEBERQUERT WIRD, IST GAR KEINE STRASSE (T-699). Max, 06.09.2026, an einem Fund
  // "Mainbruecke Eddersheim" mit dem Zweifels-Schild: "aber bei sowas wie Mainbruecke weiss man
  // das ja." Ueber einem Fluss, einem Tal, einem Kanal oder einer Bahnstrecke liegt keine Strasse,
  // auf der wir statt dessen fahren koennten — wer die Bruecke passiert, faehrt darueber.
  //
  // Die Stelle ist mit Absicht die LETZTE vor dem Achselzucken: jeder Zweig, der widerlegen kann,
  // ist damit schon gelaufen. Diese Regel kann also nur "unbestimmt" nach "bewiesen" heben, nie
  // ein Verwerfungsurteil kippen. Gemessen an den 3.366 Funden der Produktion: 45 Bauwerke fallen
  // darunter, alle aus 0150/0154/0124 und alle ohne jede Strassenangabe in der Quelle.
  //
  // Die zweite Bedingung deckt den Rest ab: nennt das STRUKTURFELD eine brauchbare gekreuzte
  // Strasse, gilt sie und nicht der Name. Drei Bauwerke im Bestand liegen genau so ("Wupper-
  // Talbruecke Oehde" traegt die A1 und kreuzt die L58) — dort waere ein pauschales "wir fahren
  // drueber" falsch, sobald die Route die L58 unterquert.
  if (istBauwerk(obstacle) && kreuztKeineStrasse(obstacle?.name) && !(brauchbar && gekreuzt != null)) {
    return "bewiesen"
  }

  return "unbestimmt"
}

/**
 * WELCHE METRIK GILT HIER — und damit: worauf muss der Disponent schauen (T-699)?
 *
 * Max, 06.09.2026: "vlt ne extra flag einbauen welche metrik relevant ist je nach strasse eben."
 *
 * Bei einem Bauwerk haengt die Antwort an der Lage, und die beiden Faelle schliessen einander aus:
 *   - eine TRAGLAST oder eine Sperrung gilt dem, der DARUEBER faehrt. Wer unten durchfaehrt, den
 *     geht sie nichts an.
 *   - eine DURCHFAHRTSHOEHE gilt dem, der DARUNTER durchfaehrt. Wer oben drueberfaehrt, den
 *     beruehrt sie nicht.
 *
 * Diese Angabe RAET NICHT die Lage — sie sagt nur, unter welcher Annahme die Zahl zutrifft. Genau
 * das fehlte am Zweifels-Schild: "Streckenbezug unbestaetigt" liess offen, was der Disponent denn
 * nun pruefen soll. Mit der Metrik daneben weiss er es.
 *
 * Sie steht bewusst NUR am unbestimmten Fund. Ist die Lage bewiesen, ist die Frage beantwortet und
 * der Hinweis waere Rauschen.
 */
// Die Liste ist am 06.09.2026 aus dem Bestand GEZAEHLT, nicht geraten. Alle attrs-Schluessel der
// 16.519 aktiven Bauwerke, nach Haeufigkeit: maxHoeheM 12.534 · grundsaetzlicheGstSperre 3.707 ·
// getrageneStrasse 3.296 · gekreuzteStrasse 1.231 · maxGewichtT 155 · gesperrtKomplett 105 ·
// vollsperrung 99 · richtung 45 · sperrungArt 7 · restbreiteM 2 · maxLaengeM 2.
//
// grundsaetzlicheGstSperre stand in einer ersten Fassung NICHT hier, und die Folge war in der
// Probe sofort sichtbar: null Funde bekamen die Angabe, obwohl 3.707 Bauwerke sie tragen. Es ist
// das mit Abstand haeufigste Befahren-Feld — die BASt-Bruecken fuehren nichts anderes.
const BEFAHREN_FELDER = [
  "grundsaetzlicheGstSperre", "maxGewichtT", "gesperrtKomplett",
  "vollsperrung", "sperrungArt", "restbreiteM", "maxLaengeM",
]

export function massgebendeLage(obstacle) {
  if (!istBauwerk(obstacle)) return null
  const attrs = obstacle?.attrs ?? {}
  const hoehe = attrs.maxHoeheM != null
  const befahren = BEFAHREN_FELDER.some((f) => attrs[f] != null)
  // Traegt es beides, sagt die Angabe nichts Trennendes und wir schweigen lieber, als zu waehlen.
  if (hoehe && befahren) return null
  if (hoehe) return "beim Unterqueren des Bauwerks"
  if (befahren) return "beim Befahren des Bauwerks"
  return null
}

/**
 * Vorab-Sieb in analyze(): kann dieses Hindernis ueberhaupt verworfen werden? Es prueft ohne
 * km-Bezug und spart so das teure ortsbezogene Matching fuer die grosse Mehrheit.
 *
 * ACHTUNG, das ist die schaerfste Stelle der ganzen Kette: was hier "false" bekommt, wird in
 * analyze() OHNE Nachfrage als "bewiesen" behandelt — zuordnung() sieht es nie. Am 01.09.2026 lief
 * genau das schief: der Namensvergleich fuer benannte Strassen war in zuordnung() fertig gebaut,
 * getestet und ausgerollt, und der Fund "Durchfahrt verboten · Sandbochumer Weg" stand nach einer
 * neuen Auswertung trotzdem noch da. Das Sieb kannte nur den Bauwerks-Fall (getragene/gekreuzte
 * Strasse) und liess eine Sperrung mit benannter Strasse gar nicht erst durch.
 */
export function kannWiderlegtWerden(obstacle, routeRefs) {
  if (!routeRefs || routeRefs.size === 0) return false
  const attrs = obstacle?.attrs ?? {}
  if (attrs.maxHoeheM != null && attrs.maxGewichtT == null) return false

  // Ein Hindernis AUF einer benannten Strasse ohne Nummer: ob es uns gilt, entscheidet
  // zuordnung() ortsbezogen. Hier genuegt, dass es moeglich ist.
  const eigenRoh = obstacle?.strassenRef ?? obstacle?.strassen_ref
  if (!istBauwerk(obstacle) && normRoadRef(eigenRoh) == null && normStrassenName(eigenRoh) != null) {
    return true
  }

  const getragen = normRoadRef(attrs.getrageneStrasse)
  const gekreuzt = normRoadRef(attrs.gekreuzteStrasse)
  if (gekreuzt == null || !routeRefs.has(gekreuzt)) return false
  return getragen == null || getragen !== gekreuzt
}


// Findings-Persistenz (T-330): Spalten an einer Stelle für den Multi-Row-INSERT-Batch.
const FINDING_COLS = `project_id, obstacle_id, kategorie, severity, titel, beschreibung,
  lat, lng, km, detail, strassen_ref, gueltig_von, gueltig_bis, quelle, zustaendig,
  route_id, route_name, geom, route_ids`
const FINDING_COL_COUNT = 19
const findingParams = (projectId, f) => [
  projectId, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
  f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
  f.gueltigVon ?? null, f.gueltigBis ?? null,
  f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
  f.routeId ?? null, f.routeName ?? null, f.geom != null ? JSON.stringify(f.geom) : null,
  // T-621: alle befahrenden Strecken-IDs (Cross-Routen-Konsistenz). null → FE fällt auf routeId zurück.
  f.routeIds != null ? JSON.stringify(f.routeIds) : null,
]

const round1 = (n) => Math.round(n * 10) / 10
const sanePoint = (p) => p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

/** Alle Stützpunkte einer GeoJSON-Linie/MultiLinie als {lat,lng} (GeoJSON-Reihenfolge [lng,lat]). */
function geomPoints(geom) {
  if (!geom || typeof geom !== "object") return []
  const out = []
  const addLine = (line) => {
    if (!Array.isArray(line)) return
    for (const p of line) {
      if (Array.isArray(p) && isFiniteNumber(p[0]) && isFiniteNumber(p[1])) out.push({ lat: p[1], lng: p[0] })
    }
  }
  if (geom.type === "LineString") addLine(geom.coordinates)
  else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) geom.coordinates.forEach(addLine)
  return out
}

// Schrittweite für den (rein DARSTELLENDEN) Korridor-Clip an die Linienlänge koppeln: clip
// densifiziert alle stepM Meter einen Punkt und prüft je Punkt nearestOnRoute (O(Routenpunkte)) →
// Kost ≈ (Länge / stepM) × Routenpunkte. Bei festem stepM=15 blockierte eine ~50-km-Linie ~2 s.
// stepM so wählen, dass ~max. CLIP_SAMPLES Dense-Punkte entstehen → gedeckelte Kost; auf Karten-
// Zoom optisch unverändert und OHNE Einfluss auf Bewertung/severity (clip = nur gerenderte Linie).
const CLIP_SAMPLES = 300
function clipStepM(obstaclePts) {
  let lenM = 0
  for (let i = 1; i < obstaclePts.length; i++) lenM += haversineKm(obstaclePts[i - 1], obstaclePts[i]) * 1000
  return Math.max(15, Math.round(lenM / CLIP_SAMPLES))
}

// Nur ECHT redundante Punkt-Dubletten zusammenfassen: gleiche Route + Kategorie + (normalisierte)
// Bezeichnung + ko-lokalisiert (Δkm ≤ DUP_KM) = dasselbe reale Hindernis doppelt gemeldet.
// WICHTIG: Einträge mit eigener Linien-Geometrie (geom) werden NIE zusammengefasst — das sind
// distinkte Strecken, oft die zwei Fahrtrichtungen/Fahrbahnen derselben Maßnahme. Die bleiben
// beide erhalten ("nicht dass die rausgehen") und das FE stellt sie als EINEN aufsplittbaren
// Marker mit Tabs dar. Behalten wird der schwerste Fund.
const DUP_KM = 0.15 // 150 m — nur wirklich ko-lokalisierte Punkt-Dubletten
const SEV_RANK = { kritisch: 3, warnung: 2, hinweis: 1 }
// Gegenfahrbahn-Filter: ab dieser Winkeldifferenz (Grad) zwischen Hindernis-Linie und
// Route-Richtung gilt die Linie als Gegenfahrbahn → für diese Fahrtrichtung irrelevant.
// 120° = klar entgegengesetzt; alles darunter (parallel/quer/zweideutig) bleibt drin.
const OPPOSITE_DEG = 120
// Enger "Same-Lane"-Radius für den Gegenfahrbahn-Filter: Segmente ≤ SAME_LANE_M gelten
// richtungsunabhängig als unsere Fahrbahn. MUSS kleiner sein als der Match-Korridor (corridorM,
// ~20 m) — sonst fällt die nur wenige Meter daneben liegende Gegenfahrbahn unter "unsere
// Fahrbahn" und würde nie ausgeblendet (genau der Gegenverkehr-Bug). 8 m ≈ Fahrstreifenbreite.
const SAME_LANE_M = Number(process.env.SAME_LANE_M ?? 8)
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

// T-603 (Daten-Audit 2026-06-27): SEVAS-Maß-Restriktionen (Höhe/Gewicht/Breite, Quelle 0157) sind
// Linien ENTLANG einer konkreten Straße. Liegt diese Straße QUER zur Route (Route über-/unterführt
// sie), berührt die Linie den 20-m-Match-Korridor nur am Kreuzungspunkt → die Auflage der gekreuzten
// Nebenstraße wird fälschlich dem Transport angehängt (geometrisch belegt: 27% der SEVAS-Funde lagen
// >80 m abseits, alle als kritisch). Der Überführungsfilter greift nicht (nur Punkt-Bauwerke ohne
// Geom). Diskriminator: läuft die Restriktionslinie DECKUNGSGLEICH (≤ SAME_LANE_M) auf der Route?
// >0 ⇒ Transport fährt auf der Straße → echte Auflage, behalten. ≈0 ⇒ nur gekreuzt → verwerfen.
const CROSS_MIN_KM = Number(process.env.SEVAS_CROSS_MIN_KM ?? 0.02) // 20 m deckungsgleicher Mindestlauf
// `verkehrsverbotLkwT` gehoert dazu und fehlte bis zum 05.09.2026 (T-654). Es ist dasselbe in
// gruen: ein Gewichtslimit an einer konkreten Strasse, nur aus dem Zeichen 253 statt aus einer
// Bruecken-Traglast. Ohne es lief dieser Filter bei 14.453 von 19.662 Gewichts-Hindernissen
// (73,5 Prozent) gar nicht erst an.
//
// Vor dem Einbau an den 42 betroffenen Funden der Produktion nachgerechnet, mit den echten
// Geometrien und diesem Code: 16 fallen weg, davon 13 mit EXAKT NULL Metern deckungsgleichem
// Mitlauf (die Linie beruehrt unsere Route nirgends, zwei nimmt der Kreuzungsfilter ohnehin).
// Drei liegen mit 15 bis 18 m knapp unter der Schwelle. Die 26 bleibenden laufen 23 m bis
// 2.445 m mit. Zwischen 0 m und 15 m klafft eine saubere Luecke, die Schwelle trennt hier also
// nicht willkuerlich. Kein Fall mit nennenswertem Mitlauf faellt weg.
export const istMassRestriktion = (a) =>
  !!a && (a.maxHoeheM != null || a.maxGewichtT != null || a.maxBreiteM != null || a.verkehrsverbotLkwT != null)

// Zwei Linien-Geometrien sind IDENTISCH (byte-gleiche Koordinaten) — kommt vom Re-Import-Churn:
// dieselbe Quell-Restriktion landet als zwei Obstacle-Zeilen mit verschiedener obstacle_id, aber
// gleicher Geometrie (T-603/T-532). Solche Klone DÜRFEN gemergt werden; zwei VERSCHIEDENE Geometrien
// (echte Fahrtrichtungs-/Fahrbahn-Paare) bleiben getrennt.
const sameGeom = (a, b) => a && b && a.type === b.type && JSON.stringify(a.coordinates) === JSON.stringify(b.coordinates)

export function dedupeFindings(findings) {
  const kept = []
  for (const f of findings) {
    const key = `${f.routeId}|${f.kategorie}|${normName(f.titel)}`
    // Strecken-Funde (beide mit geom) NICHT mergen → Fahrtrichtungen bleiben getrennt; AUSNAHME:
    // byte-identische Geometrie = Re-Import-Klon derselben Stelle → doch mergen (T-603).
    const dup = kept.find(
      (k) => k.__key === key && Math.abs(k.km - f.km) <= DUP_KM && (!(k.geom && f.geom) || sameGeom(k.geom, f.geom)),
    )
    if (!dup) {
      kept.push({ ...f, __key: key })
      continue
    }
    const fr = SEV_RANK[f.severity] ?? 0
    const dr = SEV_RANK[dup.severity] ?? 0
    if (fr > dr || (fr === dr && f.geom && !dup.geom)) Object.assign(dup, f, { __key: key })
  }
  // eslint-disable-next-line no-unused-vars
  const same = kept.map(({ __key, ...f }) => f)
  return dropCrossSourceDuplicates(same)
}

// T-611 (Audit R3, Max-Freigabe „nur dominierte"): zwei Funde auf DERSELBEN Route, am gleichen km,
// im IDENTISCHEN Zeitfenster, gleiche Kategorie, die sich NUR in der Restbreite unterscheiden — die
// BREITERE ist dominiert (wer durch die engere passt, passt durch die breitere). Nur die engste
// (kleinste Restbreite) behalten. NICHT T-609: dort waren es ZEITVERSETZTE Bauphasen (verschiedenes
// Zeitfenster → verschiedener Key → bleiben getrennt). Nur droppen, wenn eine engere Variante mit
// MINDESTENS gleicher Severity existiert (kein Info-/Severity-Verlust). Restbreite engt severity
// monoton ein, das Gate ist also in der Praxis immer erfüllt — als Sicherung trotzdem geprüft.
export function dedupeDominatedWidth(findings) {
  const groups = new Map()
  for (const f of findings) {
    if (f.restbreiteM == null) continue
    const key = `${f.routeId}|${f.kategorie}|${Math.round((f.km ?? 0) * 10)}|${f.gueltigVon ?? ""}|${f.gueltigBis ?? ""}`
    let g = groups.get(key)
    if (!g) { g = []; groups.set(key, g) }
    g.push(f)
  }
  const drop = new Set()
  for (const grp of groups.values()) {
    if (grp.length < 2) continue
    const minRb = Math.min(...grp.map((f) => f.restbreiteM))
    for (const f of grp) {
      if (f.restbreiteM > minRb + 0.01 &&
          grp.some((g) => g !== f && g.restbreiteM <= minRb + 0.01 && SEV_RANK[g.severity] >= SEV_RANK[f.severity])) {
        drop.add(f)
      }
    }
  }
  return findings.filter((f) => !drop.has(f))
}

// #22 (Max 2026-06-21): Dieselbe reale Stelle (obstacleId) wird oft von VIELEN Strecken eines
// Projekts passiert — bei z.B. 100 hochgeladenen Strecken über dieselbe Baustelle meldete die
// Engine 100 separate Funde. Über das ganze Projekt auf EINEN Fund je Stelle zusammenfassen
// (den schwersten behalten; bei Gleichstand den ersten = niedrigste km). Die km-/Routen-Zuordnung
// des behaltenen Funds bleibt erhalten (eine Strecke ist Repräsentant). Funde ohne obstacleId
// (sollte es nicht geben) bleiben unangetastet.
export function dedupeByObstacle(findings) {
  const byId = new Map()
  const out = []
  for (const f of findings) {
    if (f.obstacleId == null) {
      out.push(f)
      continue
    }
    const prev = byId.get(f.obstacleId)
    if (!prev) {
      byId.set(f.obstacleId, f)
      out.push(f)
      continue
    }
    // schwereren Fund behalten (in-place, Referenz in out bleibt erhalten)
    if ((SEV_RANK[f.severity] ?? 0) > (SEV_RANK[prev.severity] ?? 0)) Object.assign(prev, f)
  }
  return out
}

// Quellenübergreifende Dubletten: dieselbe Maßnahme aus ZWEI externen Quellen (z.B. Autobahn-Live
// + BAB-AkD-Planung über Mobilithek) erscheint doppelt — gleiche Route+Kategorie, km ≤ DUP_KM,
// aber unterschiedliche Quelle und meist unterschiedlicher Titel (greift der Titel-Dedup oben NICHT).
// Regel (Max 2026-06-19): den schwächeren Fund droppen, den KRITISCHEREN behalten. Gleich-schwere
// bleiben beide (könnten zwei Fahrtrichtungen oder echte Doppelmaßnahmen sein). Eigene Einträge
// (herkunft 'eigen') werden NIE automatisch gedroppt.
function dropCrossSourceDuplicates(findings) {
  const drop = new Set()
  for (const f of findings) {
    if (f.herkunft === "eigen" || drop.has(f)) continue
    for (const g of findings) {
      if (g === f || g.herkunft === "eigen" || drop.has(g)) continue
      if (f.routeId !== g.routeId || f.kategorie !== g.kategorie) continue
      if (Math.abs(f.km - g.km) > DUP_KM) continue
      if (normName(f.quelle?.name) === normName(g.quelle?.name)) continue // gleiche Quelle → behalten
      const rf = SEV_RANK[f.severity] ?? 0
      const rg = SEV_RANK[g.severity] ?? 0
      if (rf < rg) {
        drop.add(f)
        break
      }
      if (rg < rf) drop.add(g)
    }
  }
  return findings.filter((x) => !drop.has(x))
}

// T-607 (Audit-Runde 2): dieselbe physische Stelle erscheint mehrfach. (a) Brücken-Zwillinge je
// Fahrtrichtung — BASt/Autobahn-PUNKT-Brücken („… FR Hannover" / „… FR Oberhausen") am ~selben
// Punkt; der Gegenfahrbahn-Filter greift nur bei Linien-Geometrie (~15 %), Punkt-Brückenpaare
// entkommen, jedes Bauwerk erscheint 2× (eines ist die Gegenfahrbahn, die der Transport nie befährt).
// (b) Quell-übergreifende Doppelmeldung am identischen Ort (0001 Autobahn-live + 0145 AkD-Planung).
// Pro Route + GLEICHER Kategorie Funde ≤ LOC_M (Koord) und ≤ DUP_KM (km) zu EINEM zusammenfassen
// (schwerster; bei Gleichstand der mit Geom). Kategorie-KONSERVATIV: Baustelle wird NIE mit Sperrung
// verschmolzen (könnten distinkt sein — Max: nichts übersehen). Die Last/Restriktion gilt richtungs-
// unabhängig, daher ist der Merge zweier Richtungsdecks korrekt.
const LOC_M = 25
export function dedupeByLocation(findings) {
  const out = []
  for (const f of findings) {
    // NUR Punkt-Funde (kein geom): die FR-Zwillinge sind Punkt-Brücken; Linien-Hindernisse sind
    // bereits über den Gegenfahrbahn-Filter + dedupeFindings sauber richtungs-/dublettenbehandelt —
    // die werden hier NICHT angefasst (kein Risiko für die getunte Fahrtrichtungs-Logik).
    const twin = !f.geom && Number.isFinite(f.lat) && Number.isFinite(f.lng)
      ? out.find((k) =>
        !k.geom && k.routeId === f.routeId && k.kategorie === f.kategorie &&
        Math.abs(k.km - f.km) <= DUP_KM &&
        Number.isFinite(k.lat) && Number.isFinite(k.lng) &&
        haversineKm({ lat: k.lat, lng: k.lng }, { lat: f.lat, lng: f.lng }) * 1000 <= LOC_M)
      : null
    if (!twin) { out.push(f); continue }
    const fr = SEV_RANK[f.severity] ?? 0
    const tr = SEV_RANK[twin.severity] ?? 0
    if (fr > tr || (fr === tr && f.geom && !twin.geom)) Object.assign(twin, f)
  }
  return out
}

// T-611 (Beauty): deutsche Klein-/Verbindungswörter (mitten im Titel klein) + 3-Buchstaben-Abkürzungen,
// die NICHT als ALL-CAPS-Wort kleingeschrieben werden dürfen (Bauwerks-/Behörden-Kürzel).
const TITEL_KLEINWORT = new Set([
  "über", "unter", "den", "der", "die", "das", "dem", "des", "bei", "beim", "und", "oder", "im", "am",
  "an", "auf", "aus", "für", "mit", "von", "vom", "zur", "zum", "zwischen", "nach", "bis", "ob", "vor",
])
const TITEL_ABKZ_SCHUTZ = new Set([
  "BAB", "GST", "NOK", "PWC", "LSA", "LZA", "VFW", "AFW", "BOR", "TBW", "RFB", "ARV", "HDF", "VST", "ABS",
  "OVS", "BÜ", "EÜ", "RIFA", "AKD", "ALD", "VSP", "USA", "DEGES",
])
// ALL-CAPS-Wörter (≥3 Buchstaben) in deutsche Schreibung — Kataster (v.a. BASt 0153) liefert GROSS.
// Schützt Refs/Codes (Ziffern) automatisch (matcht nur reine Buchstaben-Läufe) + bekannte Kürzel.
function titelSchreibung(t) {
  if (!/[A-ZÄÖÜ]{3,}/.test(t)) return t // keine längeren ALL-CAPS-Wörter → unverändert (gute Titel unangetastet)
  return t
    // 1) ALL-CAPS-Funktionswörter (ÜBER/DEN/UND/BEI…) kleinschreiben — egal wie lang.
    .replace(/[A-ZÄÖÜ]{2,}/g, (w) => (TITEL_KLEINWORT.has(w.toLowerCase()) ? w.toLowerCase() : w))
    // 2) ALL-CAPS-Wörter ab 4 Buchstaben → Title Case. NICHT 3-Buchstaben (EVB/AKD/Bahn-/Behörden-
    //    Kürzel bleiben groß), NICHT geschützte Kürzel, NICHT Refs/Codes (die haben Ziffern → matcht nicht).
    .replace(/[A-ZÄÖÜ][A-ZÄÖÜß]{3,}/g, (w) => (TITEL_ABKZ_SCHUTZ.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
}

// T-607 (Audit-Runde 2): Roh-Quell-Labels lesbar machen. Die Connectoren reichen interne Bauwerks-/
// Planungs-Strings 1:1 als Titel durch (BASt-„X/X"-Vollduplikate, Teilbauwerk-/Richtungs-Codes,
// AkD-Planungs-IDs „Lage-N/AkD NNNNN/1-str. R KS/19h bis 6h"). Hier zentral säubern — der Beschreibungs-
// Text (Popup) bleibt der ECHTE Quelltext, nur der Anzeige-Titel wird humanisiert.
export function humanizeTitel(s, kat) {
  let t = String(s ?? "").replace(/[\s\-–/,;]+$/, "").trim()
  if (kat === "bruecke" || kat === "tunnel") {
    // T-610: BASt-Kataster-Codes raus (Titel = roher Bauwerksname, lief bisher nicht durch den Humanizer):
    // führende Bauwerksnummer „BW 26 - "/„Bw 24, "; „i.Z.d. [BAB] A7 …"-Tail (im-Zuge-der = getragene
    // Straße, steht bereits in strassen_ref); „, km 272,903"-Tail; „; FR: F"-Tail; Ufg→Unterführung.
    t = t
      .replace(/^\s*B[wW]\s*\d+[a-z]?\s*[,\-]\s*/, "")
      .replace(/\s*[,;]?\s*i\.?\s*Z\.?\s*d\.?\s*(?:BAB\s*)?[AB]\s?\d+.*$/i, "")
      .replace(/\s*[,;]\s*(?:in\s*)?km\s*[\d.,]+.*$/i, "")
      // T-611 (Beauty): „… über A1 km 176,817" / „in km 119,193" / „km 44,5-37,0 RiFa Nord" — Stations-
      // km-Tail (auch space-getrennt, inkl. führendem „in/bei") bis Zeilenende strippen (BASt 0153).
      .replace(/[\s,]*(?:\b(?:in|bei)\s+)?km\s+\d[\d.,]*(?:\s*-\s*[\d.,]+)?.*$/i, "")
      .replace(/\s*;\s*FR:?\s*\w*\s*$/i, "")
      // T-611: BASt-Netzknoten-Code-Tail „, Ab 265, St 5006" / „, Ab 280, St 5806/Tbw2" raus (für
      // Disponenten bedeutungslos). NUR am „Ab …"-Anker — ein freistehendes „St 2406" ist eine bayerische
      // STAATSSTRASSE (überquerte Straße, behalten), kein Stationscode. Vor dem X/X-Collapse, weil „/Tbw2"
      // sonst einen Stör-Slash hinterließe; Uf/ÜF-Expansion erst NACH dem Collapse (sonst bricht die
      // Symmetrie von „UF WW/UF WW").
      .replace(/\s*[,/]?\s*\bAb\s+\d+(?:\s*,?\s*St\s+\d+(?:\/[A-Za-zÄÖÜ]+\d*)?)?\b/gi, "")
    // ZUERST Richtungs-/Teilbauwerk-/FR-Tails — sonst bricht ein FR-Suffix auf NUR EINER Hälfte
    // („…Windmühle/…Windmühle, FR Hannover") die Symmetrie und der „X/X"-Dup-Collapse greift nicht.
    t = t
      .replace(/\s*[/,]\s*(Rifa|RiFa|RiFb|Fahrtrichtung|Richtungsfahrbahn|Ri\.?Fb?|RF|Tbw|TBW|Bauwerk|Betriebs|Überbau|Ostseite|Westseite|Nordseite|Südseite|südl\.|nördl\.|östl\.|westl\.|östliches|nördliches|BA\s+I+I*\b)\b.*$/i, "")
      .replace(/\s*[,(]?\s*\b(FR|Rifa)\s+[A-Za-zÄÖÜäöüß.-]+\b\)?/gi, "")
      .replace(/_FR\s*\w+(_\w+)?/gi, "")
      .replace(/\s*\(\s*\d+\/\d+\s*\)/g, "").replace(/\s*\(\s*BW\s*[\d.]+\s*\)/gi, "") // (5/1), (BW 2.02)
  } else {
    t = t
      .replace(/\s*\/{2,}.*$/s, "") // T-611: „/// Halbseitige Sperrung…" / „// halbseitig…" — Sperr-Meta nach Doppelslash raus, Straßenteil bleibt
      .replace(/\s*\(DATEX\)\s*$/i, "") // T-611: „baustelle (DATEX)" → „baustelle" (Platzhalter ohne Straße/Beschr; wird unten großgeschrieben)
      // T-611 (Beauty): Bayern 0147 hängt „…, Baustelle, von 31.08.2026 07:00 bis … Uhr" an — der Zeitraum
      // steht strukturiert in gueltig_von/bis. Datums-/Uhrzeit-Tail + nachgestelltes Maßnahmenwort strippen.
      .replace(/,?\s*(?:von|ab|bis|g(?:ü|ue)ltig:?)\s+\d{1,2}\.\d{1,2}\.\d{2,4}\b.*$/i, "")
      .replace(/,\s*(?:Baustelle|Beschr(?:ä|ae)nkungen|Sperrung|Sonstiges)\s*$/i, "")
      .replace(/\s*-?\s*\b(?:HDF|VST|EF|ZM|SW|BRW)_[\w-]+/gi, "").replace(/\s*\bA-\d{5}-\d+\b/g, "") // T-610/T-611: Länder-/Autobahn-Auftragscodes (HDF_/VST_/EF_/ZM_/SW_/BRW_)
      .replace(/\s*-\s*Lage-\d+.*$/i, "").replace(/\s*-\s*AkD\s*\d+/gi, "").replace(/\s*-\s*A[lL]D\b/g, "")
      .replace(/\s*-\s*\d{1,2}-?str\.?\s*R\s*\w+/gi, "").replace(/\s*-\s*\d{1,2}h\s*bis\s*\d{1,2}h/gi, "")
      .replace(/\s*-\s*\d{1,2}\.\d{1,2}\.\d{2,4}/g, "").replace(/\s*\(ARV[^)]*\)/gi, "")
  }
  // DANN BASt-Volldup „X/X" (Quelle hängt denselben Block 2× an) — jetzt symmetrisch kollabierbar.
  t = t.replace(/[\s\-–/,;]+$/, "").trim()
  const slash = t.split("/")
  if (slash.length >= 2 && slash.length % 2 === 0) {
    const h = slash.length / 2
    const norm = (x) => x.join("/").replace(/[\s\-–]+/g, "").toLowerCase()
    if (norm(slash.slice(0, h)) === norm(slash.slice(h))) t = slash.slice(0, h).join("/").trim()
  }
  // T-611: Near-Dup „A2 / Ahse/A2 / Ahsebrücke" (Quelle hängt eine Namensvariante an) — wenn der Titel an
  // einem zweiten „A<nr> /" mit IDENTISCHER A-Nummer bricht, erste Hälfte behalten (bounded, kein echtes Verstecken).
  const adup = t.match(/^(A\d+\b.*?)\/\s*(A\d+\b.*)$/)
  if (adup) {
    const aNr = (x) => (x.match(/^A\d+/) || [])[0]
    if (aNr(adup[1]) && aNr(adup[1]) === aNr(adup[2])) t = adup[1].trim()
  }
  // T-611: Uf/UF→Unterführung, Üf/ÜF/UeF/UEF→Überführung — NACH dem Dup-Collapse (s.o.), sonst bricht
  // die Expansion die „X/X"-Symmetrie. Vorher expandierte nur Ufg + lowercase-Üf.
  if (kat === "bruecke" || kat === "tunnel") {
    t = t
      .replace(/(^|\s)(?:Üfg|ÜFG)\.?/g, "$1Überführung") // \b greift nicht vor Umlaut Ü (non-ASCII)
      .replace(/\b(?:Ufg|UFG)\.?/g, "Unterführung")
      .replace(/(^|\s)(?:Üf|ÜF|UeF|UEF|Uef)(?=\s|$)/g, "$1Überführung")
      .replace(/(^|\s)(?:Uf|UF)(?=\s|$)/g, "$1Unterführung")
      .replace(/(^|\s)E(?:Ü|ü)(?=\s|$)/g, "$1Eisenbahnüberführung")
  }
  t = titelSchreibung(t) // T-611 (Beauty): ALL-CAPS-Kataster-Namen → deutsche Schreibung
  t = t.replace(/[\s\-–/,;]+$/, "").replace(/^\s*[/,]\s*/, "").replace(/\s{2,}/g, " ").trim()
  // T-611 (Beauty): nur-Junk-Titel („---", „/", „.") → sprechender Kategorie-Default statt Müll/Original.
  if (/^[\s\-–/.,;:_]*$/.test(t)) {
    const DEFAULT = { bruecke: "Brücke", tunnel: "Tunnel", engstelle: "Engstelle", gewicht: "Gewichtsbeschränkung", baustelle: "Baustelle", sperrung: "Sperrung", sonstige: "Hindernis" }
    return DEFAULT[kat] || "Hindernis"
  }
  // T-611: Erstbuchstabe groß (z.B. „baustelle"→„Baustelle"); für bereits großgeschriebene Titel ein No-op.
  if (t && /^[a-zäöü]/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1)
  return t || String(s ?? "").trim() // nie leeren Titel zurückgeben (Fallback = Original)
}

/** Analysierbare Routen: ≥2 valide Punkte (Geometrie) UND freigegeben.
 *  Prüfen-Gate (T-593): aus einem VEMAGS-Bescheid rekonstruierte Strecken werden erst nach
 *  manueller Prüfung (verifiziert=true) ausgewertet — ungeprüfte Strecken fließen NICHT in
 *  Findings/Schnitte/Dashboard (variierende Bescheid-Qualität, müssen erst sauber gezogen werden). */
export function usableRoutes(routes) {
  return (Array.isArray(routes) ? routes : [])
    .filter((r) => !(r?.source === "vemags" && r?.verifiziert !== true))
    .map((r) => ({
      ...r,
      points: Array.isArray(r?.points) ? r.points.filter(sanePoint) : [],
    }))
    .filter((r) => r.points.length >= 2)
}

/** Reine Analyse (ohne Persistenz): liest Hindernisse via db, berechnet Findings. */
export async function analyze({ db, project, corridorM, osrm = null }) {
  const routes = usableRoutes(project.routes)
  if (routes.length === 0) {
    // Gate (T-593): es können Strecken existieren, aber alle ungeprüft (VEMAGS) → für die Auswertung
    // nicht freigegeben. Klare Meldung statt „Strecke hochladen".
    const hatUngeprüft = (project.routes ?? []).some((r) => r?.source === "vemags" && r?.verifiziert !== true)
    throw new ApiError(
      422,
      hatUngeprüft
        ? "Keine freigegebene Strecke — bitte VEMAGS-Strecken erst prüfen & freigeben."
        : "Keine Strecke mit Punkten vorhanden — Strecke hochladen",
    )
  }

  // T-330: Geometrie/Korridor je Route einmal vorbereiten, dann EIN SELECT über die OR-Verknüpfung
  // aller Routen-Bboxen statt R einzelner Queries — jedes Hindernis (inkl. geom-Blob) wird so nur
  // einmal aus der DB gezogen, auch wenn es im Korridor mehrerer Teilstrecken liegt. Bewusst die
  // OR-Verknüpfung der kleinen Boxen, NICHT die umschließende Gesamt-Bbox: bei weit auseinander
  // liegenden Teilstrecken (mehrere Bundesländer) würde die Hüll-Box halb Deutschland in den Heap ziehen.
  // T-601: je Route die tatsächlich befahrenen Straßen-Refs aus OSRM ziehen (Steps) — Grundlage des
  // Überführungs-Filters. Wegpunkte bevorzugt (definieren die Route exakt), sonst die Punktliste
  // ausdünnen. Null bei fehlendem OSRM/Fehler → Filter greift dann nicht (konservativ).
  // T-653: zusaetzlich zu den Refs die SCHRITT-GEOMETRIEN holen. Nur damit laesst sich fragen,
  // welche Strasse die Route AN EINER STELLE faehrt. Fail-open wie zuvor: null bei jedem Fehler.
  const routeStrassen = await Promise.all(routes.map((route) => {
    if (!osrm) return null
    const wp = Array.isArray(route.waypoints) && route.waypoints.length >= 2
      ? route.waypoints
      : route.points.filter((_, i) => i % Math.max(1, Math.floor(route.points.length / 100)) === 0)
    return (osrm.strassenAbschnitte ? osrm.strassenAbschnitte(wp) : osrm.roadRefs(wp).then((r) => (r ? { refs: r, abschnitte: [] } : null)))
      .catch(() => null)
  }))

  const routeCtx = routes.map((route, i) => {
    const geometry = downsample(route.points.map((p) => ({ lat: p.lat, lng: p.lng })))
    // Gitter-Index je Route einmal bauen → nearestOnRoute/clip prüfen nur nahe Segmente statt aller
    // ~2000 (Hauptkost bei langen Routen mit vielen Kandidaten-Hindernissen). Gleiche Treffer.
    const cum = cumulativeKm(geometry)
    const grid = buildRouteGrid(geometry)
    return {
      route,
      geometry,
      cum,
      bbox: bboxWithBuffer(geometry, corridorM),
      grid,
      refs: routeStrassen[i]?.refs ?? null,
      // Sortierte km-Spannen je Strasse. Gebaut wird das einmal je Route; die Abfrage laeuft
      // danach per Binaersuche, weil sie je Hindernis-Kandidat faellt (bei 4.600 Kandidaten
      // waere ein linearer Scan ueber alle Abschnittspunkte die neue Hauptkost).
      strassenSpannen: strassenSpannenBauen(routeStrassen[i]?.abschnitte, geometry, cum, grid),
    }
  })

  let findings = []
  let distanzKm = routeCtx.reduce((sum, c) => sum + totalKm(c.geometry), 0)

  // v3: globale Hindernisse + Kunden-Einträge des Projekt-Tenants. Bbox-Vorfilter in SQL, exaktes
  // Korridor-Matching danach in JS — pro Route gegen ihre eigene Bbox (gleiche Funde wie zuvor).
  //
  // T-700: geprueft wird die Bbox der GEOMETRIE, nicht der Ankerpunkt. Der Unterschied ist kein
  // Randfall: 13,3 Prozent aller Linien-Hindernisse reichen mehr als einen Kilometer ueber ihren
  // Anker hinaus, und in einer Stichprobe von 500 Geometrien lag der Anker bei 88 ausserhalb der
  // eigenen Box. Ueber alle 67 ausgewerteten Projekte gezaehlt fielen dadurch 172 Hindernisse aus
  // dem Vorfilter, die im 20-m-Korridor liegen — 17 davon mit sicherer Restbreiten-Verletzung.
  //
  // Die vier Spalten sind generiert und dank COALESCE auf lat/lng IMMER gefuellt (Migration 076),
  // deshalb steht hier kein COALESCE: die Bedingung bleibt ein schlichter Bereichsvergleich, und
  // obstacles_geom_bbox_idx ist darauf nutzbar. Fuer ein Punkt-Hindernis ist die Box entartet
  // (min == max == Anker), die Bedingung also genau die alte.
  const params = [project.tenantId ?? null]
  const boxSql = routeCtx
    .map((c) => {
      const i = params.push(c.bbox.minLat, c.bbox.maxLat, c.bbox.minLng, c.bbox.maxLng) - 4
      // Zwei Boxen ueberschneiden sich, wenn keine komplett neben der anderen liegt.
      return `(geom_max_lat >= $${i + 1} AND geom_min_lat <= $${i + 2}
               AND geom_max_lng >= $${i + 3} AND geom_min_lng <= $${i + 4})`
    })
    .join(" OR ")
  const exclIdx = params.push(AUSWERTUNG_AUSGESCHLOSSEN)
  const { rows } = await db.query(
    `SELECT ${OBSTACLE_COLS}, geom FROM obstacles WHERE aktiv = true
       AND (tenant_id IS NULL OR tenant_id = $1::uuid)
       AND (${boxSql})
       AND kategorie <> ALL($${exclIdx}::text[])`, // Bauwerke raus — macht das Strecken-Engineering
    params,
  )
  const obstacles = rows.map(rowToObstacle)
  // T-657: abgeleitete Angaben dazuholen. Sie fuellen nur Luecken, nie gemeldete Werte, und
  // jeder uebernommene Wert wird am Fund vermerkt. Faellt der Abruf aus (Tabelle fehlt, Fehler),
  // laeuft die Analyse ohne Anreicherung weiter — sie ist eine Zugabe, keine Voraussetzung.
  const abgeleitet = await ladeAnreicherung(db, obstacles.map((o) => o.id))
  // Welche Felder stammen aus der Ableitung — unabhaengig davon, ob sie noch als Luecke offen
  // sind. Seit die Werte auch nach obstacles.attrs geschrieben werden (T-657), fuellt
  // mitAnreicherung nichts mehr; die Herkunft steht trotzdem in der Anreicherungstabelle, und
  // nur sie darf ueber die Kennzeichnung entscheiden.
  const kiFelder = await kiFelderJePunkt(db, obstacles.map((o) => o.id))

  // Event-Loop-Schonung: Das Matching ist reine CPU (nearestOnRoute über die ganze Geometrie je
  // Hindernis, KEIN await im Loop) und lief bei langen Mehr-Strecken-Projekten ~70 s am Stück — das
  // blockiert den single-threaded Node-Loop, die API antwortet währenddessen NIEMANDEM (Health/Seiten/
  // andere Nutzer „gehen in die Knie"). Daher ~alle 40 ms den Loop freiwillig freigeben (setImmediate):
  // andere Requests werden zwischen den Häppchen bedient, die Analyse wird nur minimal länger.
  // ponytail: kooperatives Yielding (eine CPU / ein Loop). Echte Parallelität vieler schwerer Analysen
  // bräuchte eine Job-Queue / Worker-Thread — erst bauen, wenn gleichzeitige Langläufe real auftreten.
  let lastYield = Date.now()
  // Gibt den Event-Loop frei, wenn seit dem letzten Yield > ~40 ms CPU vergangen sind. Wird sowohl
  // je Hindernis als auch im inneren Stützpunkt-Scan aufgerufen — ein einzelnes langes Linien-
  // Hindernis (viele geom-Punkte) im großen Korridor-Bbox scannte sonst ~2 s am Stück (Lag-Spike).
  const maybeYield = async () => {
    if (Date.now() - lastYield > 40) {
      await new Promise((r) => setImmediate(r))
      lastYield = Date.now()
    }
  }
  // T-700: die Bbox der GEOMETRIE je Hindernis, einmal fuer alle Routen. Ohne sie waere der
  // SQL-Vorfilter oben wirkungslos — die Hindernisse kaemen aus der Datenbank und fielen hier
  // wieder heraus, weil der Vergleich denselben Ankerpunkt-Fehler machte.
  //
  // geomPoints() und NICHT die Geometrie-Spalten aus SQL: die beiden muessen dieselbe Punktbasis
  // haben wie das Matching darunter, sonst liesse dieser Filter etwas durch, das nachher gar
  // nicht geprueft wird. geomPoints kennt Linien; bei Polygonen liefert es leer, und dann bleibt
  // es beim Anker — genau wie das Matching selbst.
  const obstacleBox = new Map()
  for (const o of obstacles) {
    const pts = geomPoints(o.geom)
    if (pts.length) obstacleBox.set(String(o.id), bboxWithBuffer(pts, 0))
  }

  for (const ctx of routeCtx) {
    const { route, geometry, cum, bbox, grid, refs } = ctx
    for (const rohObstacle of obstacles) {
      const { obstacle, ergaenzt } = mitAnreicherung(rohObstacle, abgeleitet.get(String(rohObstacle.id)))
      await maybeYield()
      // nur Hindernisse in der Bbox DIESER Route prüfen (inkl., wie BETWEEN zuvor).
      const oBox = obstacleBox.get(String(rohObstacle.id))
      if (
        oBox
          // Zwei Boxen ueberschneiden sich, wenn keine komplett neben der anderen liegt.
          ? (oBox.maxLat < bbox.minLat || oBox.minLat > bbox.maxLat ||
             oBox.maxLng < bbox.minLng || oBox.minLng > bbox.maxLng)
          : (obstacle.lat < bbox.minLat || obstacle.lat > bbox.maxLat ||
             obstacle.lng < bbox.minLng || obstacle.lng > bbox.maxLng)
      ) continue
      // T-653: das Urteil ueber die Zuordnung faellt WEITER UNTEN, es braucht die km-Position und
      // die gibt es erst nach dem Matching. Hier steht nur noch ein billiges Vorab-Sieb: ist ein
      // Widerlegen ueberhaupt denkbar? Wenn nicht, aendert das spaetere Urteil nichts am Ausgang
      // und wir sparen uns nichts, indem wir es vorziehen. Die Ersparnis des alten Vorfilters
      // (teures Matching gar nicht erst starten) bleibt damit erhalten, sein Fehlurteil nicht.
      const widerlegbar = kannWiderlegtWerden(obstacle, refs)
      const obstaclePts = geomPoints(obstacle.geom)
      // Punkt-Hindernis: Abstand des Punkts zur Route. Strecken-Hindernis (geom = Linie):
      // den Linien-Stützpunkt nehmen, der der Route am NÄCHSTEN ist — so greift eine an der
      // Route entlanglaufende Maßnahme auch dann, wenn ihr Mittel-/Ankerpunkt versetzt liegt,
      // und ein Punkt 16 m neben der Route fällt sauber raus.
      let near = nearestOnRoute({ lat: obstacle.lat, lng: obstacle.lng }, geometry, cum, grid)
      for (let pi = 0; pi < obstaclePts.length; pi++) {
        const p = obstaclePts[pi]
        if (near.distM <= corridorM) break // schon im Korridor — günstig, kein Weitersuchen nötig
        if ((pi & 63) === 0) await maybeYield() // alle 64 Stützpunkte den Loop atmen lassen
        const n = nearestOnRoute(p, geometry, cum, grid)
        if (n.distM < near.distM) near = n
      }
      if (near.distM > corridorM) continue

      // T-653: JETZT steht die km-Position fest, also kann die Zuordnung lokal geprueft werden.
      // Nur "widerlegt" verwirft, und nur die autoritative Oben-Unten-Aussage kann dahin fuehren.
      // "unbestimmt" bleibt drin und wird am Fund vermerkt: lieber ein gekennzeichneter Zweifel
      // als eine still geschluckte Sperrung.
      const zuord = widerlegbar || istBauwerk(obstacle)
        ? zuordnung(obstacle, ctx, near.km)
        : "bewiesen"
      if (zuord === "widerlegt") continue

      // Gegenfahrbahn-Filter: Strecken-Meldungen (Linien-Geometrie, faktisch nur Autobahn)
      // laufen je Fahrbahn als eigene Linie in REISERICHTUNG (Daten geprüft: Koordinaten-
      // Reihenfolge = Fahrtrichtung). Läuft die Linie im Korridor ÜBERWIEGEND gegen die
      // Reiserichtung (Gegenfahrbahn), passiert der Transport sie nicht → ausblenden.
      // obstacleRouteRelation gewichtet segmentweise nach Länge mit lokalem Kurs; Punkte
      // und nur-quer/zweideutig liegende Linien → "none"/"parallel" → bleiben IMMER drin.
      // coincidentM = enger Same-Lane-Radius (NICHT der 20-m-Match-Korridor!), damit die nur
      // wenige Meter daneben liegende Gegenfahrbahn in den Bearing-Check-Ring fällt und als
      // gegenläufig ausgeblendet wird; relationM weiter, um den Mittelstreifen-Abstand zu erfassen.
      const relation = obstacleRouteRelation(obstaclePts, geometry, cum, {
        coincidentM: Math.min(SAME_LANE_M, corridorM),
        relationM: Math.max(corridorM * 3, 60),
        oppositeDeg: OPPOSITE_DEG,
      })
      if (relation === "opposite") continue
      // T-603: Maß-Restriktion (SEVAS Höhe/Gewicht/Breite) auf einer Linie, die die Route nur KREUZT
      // statt deckungsgleich auf ihr zu verlaufen → gilt der gekreuzten Straße, nicht uns → verwerfen.
      // Echte Auflagen auf der befahrenen Trasse (auch kurzes Erst-/Letztstück) laufen deckungsgleich
      // → coincidentRouteKm > 0 → bleiben. Greift nur bei Linien-Geom mit Maßwert-Attribut.
      if (
        obstacle.geom && istMassRestriktion(obstacle.attrs) &&
        coincidentRouteKm(obstaclePts, geometry, cum, SAME_LANE_M, grid) < CROSS_MIN_KM
      ) continue
      // T-611 (Audit R3): allgemeiner Kreuzungsfilter für ALLE Linien-Meldungen (auch Baustelle/
      // Sperrung OHNE Maßwert). Am Autobahndreieck/-kreuz laufen die gekreuzte Autobahn + Rampen
      // quer durch den 20-m-Korridor, ohne dass der Transport sie befährt → gehören der gekreuzten
      // Straße, nicht uns. Richtungsbasiert (quer vs. längs), damit eine nur durch den Mittelstreifen
      // versetzte, aber GLEICHLAUFENDE Baustelle NICHT mitgedroppt wird (konservativ, im Zweifel behalten).
      if (obstacle.geom && lineCrossesRoute(obstaclePts, geometry, cum, grid, { nearM: corridorM })) continue
      // T-641: Abseits-Filter — die Quell-Linie berührt den Korridor nur tangential (nicht befahrene
      // Rampe an AS/Autobahnkreuz, parallele Fremdstraße), läuft aber nirgends gleichgerichtet auf der
      // Route mit UND verläuft überwiegend klar abseits. Der Kreuzungsfilter greift hier NICHT (die
      // Rampe liegt am Berührpunkt PARALLEL, nicht quer); erst der fehlende Mitlauf entlarvt sie.
      // Konservativ: kurze Linien (< 120 m Abseits-Anteil) und alles mit ≥ 35 m Mitlauf bleiben drin.
      // TEIL-Linien statt obstaclePts: das Flattening würde Phantom-Sprünge zwischen MLS-Teilen messen.
      if (obstacle.geom && lineOffRoute(geomLineParts(obstacle.geom), geometry, cum, grid, { nearM: corridorM })) continue
      const verdict = evaluate(obstacle, project.transport, project.zeitraum)
      if (!verdict) continue
      // T-653: den Zweifel sichtbar machen, statt ihn zu verschweigen. detail ist bereits JSONB
      // (findingParams), es braucht keine Migration. Die Severity bleibt unangetastet: ob ein Fund
      // uns gilt, ist eine andere Frage als wie schlimm er waere, und die zweite darf die erste
      // nicht ueberschreiben.
      if (zuord === "unbestimmt") {
        // T-699, Max: "vlt ne extra flag einbauen welche metrik relevant ist je nach strasse".
        // Der Zweifel allein laesst den Disponenten ratlos zurueck. Er wird handhabbar, sobald
        // dabeisteht, WORAUF die Zahl sich bezieht: eine Traglast gilt beim Befahren, eine
        // Durchfahrtshoehe beim Unterqueren. Damit weiss er, wonach er vor Ort schauen muss.
        const lage = massgebendeLage(obstacle)
        verdict.detail = {
          ...(verdict.detail ?? {}),
          Zuordnung: "nicht nachweisbar",
          ...(lage ? { Gilt: lage } : {}),
        }
      }
      // T-657: hat eine abgeleitete Angabe zu dieser Bewertung beigetragen, steht das am Fund.
      // Die Oberflaeche macht daraus ihr Zeichen; ohne diesen Vermerk saehe ein ergaenzter Wert
      // aus wie ein gemeldeter, und genau das darf er nicht.
      // Die Kennzeichnung folgt der HERKUNFT, nicht dem Zeitpunkt: ein Wert, der laengst in attrs
      // steht, bleibt abgeleitet und muss es auch sagen.
      const ausKi = kiFelder.get(String(rohObstacle.id)) ?? ergaenzt
      const vermerk = anreicherungsVermerk(ausKi, rohObstacle?.attrs)
      if (vermerk) {
        // __ki traegt die Detail-ZEILEN, die auf einem abgeleiteten Wert beruhen. Die Karte setzt
        // ihr Zeichen genau dort, statt nur pauschal "irgendetwas war KI" zu melden. Der
        // Unterstrich-Name haelt es aus dem sichtbaren Raster heraus.
        verdict.detail = { ...(verdict.detail ?? {}), Ergänzt: vermerk, __ki: kiZeilen(ausKi) }
      }
      // Linien-Geometrie auf den Routen-Korridor clippen → nur der durchfahrene Teil der Baustelle
      // wird gerendert (nicht die ganze, oft kilometerlange Quell-Linie). Fallback auf die volle
      // Linie, falls der Clip leer ausfällt — nie die Info ganz verlieren.
      // Perf/Stabilität: clipGeomToCorridor kostet ~ (Quell-Stützpunkte × Routenpunkte) und lief bei
      // sehr langen Linien-Hindernissen (~1700 Punkte) ~2 s synchron = der verbliebene Event-Loop-
      // Spike. Da der Clip NUR die gerenderte Linie bestimmt (keine Bewertung/severity), die Quelle
      // vorher auf ≤300 Punkte ausdünnen — auf Karten-Zoom optisch identisch. Yield direkt davor.
      await maybeYield()
      const geomFuerFund = obstacle.geom
        ? (clipGeomToCorridor(obstacle.geom, geometry, cum, Math.max(corridorM * 3, 60), { stepM: clipStepM(obstaclePts), grid }) ?? obstacle.geom)
        : null
      // T-607: Markerposition. Bei langen Linien-Hindernissen (Autobahn-/AkD-Baustellen über viele km)
      // ist obstacle.lat/lng der ANKER der Gesamtlinie und liegt bis zig km vom Routen-Schnittpunkt
      // entfernt (gemessen 58 km) → der Marker säße weit außerhalb der Route. Für Linien-Hindernisse
      // den der Route nächsten Punkt der geclippten Linie bestimmen und dann auf den nächsten ROHEN
      // Routen-Stützpunkt (route.points — das ist die im FE GEZEICHNETE Linie) schnappen. So sitzt der
      // Marker GARANTIERT exakt auf der gerenderten Trasse, robust gegen den Downsample-Drift der
      // Auswertungs-Geometrie auf gewundenen Routen. Punkt-Hindernisse behalten ihre echte Koordinate.
      let markerPt = { lat: obstacle.lat, lng: obstacle.lng }
      if (obstacle.geom) {
        let obstNear = null, best = Infinity
        for (const p of geomPoints(geomFuerFund)) {
          const d = nearestOnRoute(p, geometry, cum, grid).distM
          if (d < best) { best = d; obstNear = p }
        }
        if (obstNear) {
          let bp = Infinity
          for (const rp of route.points) {
            if (!isFiniteNumber(rp?.lat) || !isFiniteNumber(rp?.lng)) continue
            const d = haversineKm(obstNear, rp)
            if (d < bp) { bp = d; markerPt = { lat: rp.lat, lng: rp.lng } }
          }
        }
      }
      findings.push({
        obstacleId: obstacle.id,
        kategorie: obstacle.kategorie,
        severity: verdict.severity,
        titel: verdict.titel,
        // Popup zeigt den ECHTEN Quelltext (z.B. Autobahn-GmbH-Meldung), nicht unseren generierten
        // Satz. Die Bewertung steckt in severity + detail. Fallback auf den Regeltext, falls die Quelle
        // keinen Beschreibungstext liefert.
        beschreibung: (obstacle.beschreibung && obstacle.beschreibung.trim()) || verdict.beschreibung,
        detail: verdict.detail,
        // T-042: Auflagen-Lage mitfuehren. Ohne sie sieht der Aufrufer nur den
        // Schweregrad und kann nicht entscheiden, ob die Stelle mit Auflagen fahrbar
        // ist, ein Verfahren braucht oder ausgeschlossen ist.
        auflagenLage: verdict.auflagenLage ?? null,
        // T-607: Marker an den Routen-Schnittpunkt (nächster Linien-Stützpunkt im Korridor), nicht an
        // den oft zig km entfernten Anker langer Linien-Hindernisse. Punkt-Hindernisse: = obstacle.
        lat: markerPt.lat,
        lng: markerPt.lng,
        geom: geomFuerFund, // auf den Routen-Korridor geclippte Strecke (nur durchfahrener Teil), sonst Punkt
        km: near.km, // Position auf SEINER Route — bereits deterministisch in nearestOnRoute() gerundet (#9)
        routeId: route.id,
        routeName: route.name,
        strassenRef: obstacle.strassenRef,
        gueltigVon: obstacle.gueltigVon,
        gueltigBis: obstacle.gueltigBis,
        quelle: obstacle.quelle,
        zustaendig: obstacle.zustaendig,
        herkunft: obstacle.herkunft, // 'global'|'eigen' — nur für Dedup (nicht persistiert)
        restbreiteM: isFiniteNumber(obstacle.attrs?.restbreiteM) ? obstacle.attrs.restbreiteM : null, // T-611: transient für dominierte-Breite-Dedup (nicht persistiert)
      })
    }
  }
  // T-621: dieselbe reale Stelle (obstacleId) liegt oft auf MEHREREN Strecken eines Projekts. Der
  // Cross-Routen-Dedup (dedupeByObstacle) behält EINEN Repräsentanten mit EINER routeId — zeigte man
  // dann nur eine ANDERE befahrende Strecke, verschwände der Fund (nur an Strecke 1 „angehängt"). Daher
  // VOR dem Dedup je obstacleId ALLE befahrenden routeIds sammeln und sie NACH dem Dedup an den
  // überlebenden Fund hängen (order-unabhängig, verliert keine Strecke). Das FE zeigt den Fund, sobald
  // IRGENDEINE seiner routeIds sichtbar ist — einmal, aber konsistent über alle befahrenden Strecken.
  const routesByObstacle = new Map()
  for (const f of findings) {
    if (f.obstacleId == null || f.routeId == null) continue
    let set = routesByObstacle.get(f.obstacleId)
    if (!set) { set = new Set(); routesByObstacle.set(f.obstacleId, set) }
    set.add(f.routeId)
  }
  findings = dedupeFindings(findings) // klare Dubletten (quellenübergreifend / beide Richtungen) rausschneiden
  findings = dedupeByObstacle(findings) // #22: dieselbe Stelle über viele Strecken → EIN Fund
  findings = dedupeByLocation(findings) // T-607: Brücken-Richtungszwillinge + quell-übergreifende Orts-Dubletten
  findings = dedupeDominatedWidth(findings) // T-611: gleiche Route+km+Zeit, nur breitere Restbreite = dominiert → raus
  for (const f of findings) {
    const set = f.obstacleId != null ? routesByObstacle.get(f.obstacleId) : null
    f.routeIds = set && set.size ? [...set] : f.routeId != null ? [f.routeId] : []
  }
  for (const f of findings) f.titel = humanizeTitel(f.titel, f.kategorie) // T-607: kryptische Roh-Labels lesbar machen
  findings.sort((a, b) => a.km - b.km)

  distanzKm = round1(distanzKm)
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const warnung = findings.filter((f) => f.severity === "warnung").length
  // Reine Fahrzeit-Schätzung über die Strecke (≈50 km/h Schnitt für Schwertransport).
  // KEIN Zuschlag je Fund mehr — bei vielen Funden hätte das die Zeit unrealistisch
  // aufgebläht (734 km → 156 h war Unsinn).
  const fahrzeitMin = Math.round((distanzKm / 50) * 60)

  return {
    findings,
    distanzKm,
    fahrzeitMin,
    provider: { router: "upload", fallback: false },
    stats: {
      findings: findings.length,
      kritisch,
      warnung,
      hinweis: findings.length - kritisch - warnung,
      distanzKm,
      routen: routes.length,
    },
  }
}

/**
 * Kompletter Analyse-Lauf inkl. analysis_runs-Record und transaktionaler
 * Persistenz. Wirft bei Fehlern (Projekt bleibt dann unverändert, Run = error).
 */
export async function runAnalysis({ db, project, corridorM = 20, osrm = null }) {
  // T-467: verwaiste 'running'-Läufe (Prozess-Crash ohne finished_at) zuerst freigeben, sonst
  // blockiert der Partial-Unique-Index dauerhaft. 15 Min > jede reale Analyse (statement_timeout 2 Min).
  // WICHTIG: Der Reclaim MUSS zeit-prädikat-gebunden bleiben (nur Waisen >15 Min). Der
  // Partial-Unique-Index analysis_runs_one_running — NICHT dieser UPDATE — ist die Mutual-Exclusion;
  // ein Reclaim ohne Zeit-Prädikat ('alle running freigeben') öffnete ein Doppel-Run-Loch.
  await db.query(
    "UPDATE analysis_runs SET status = 'error', error = $2, finished_at = now() " +
      "WHERE project_id = $1 AND status = 'running' AND started_at < now() - interval '15 minutes'",
    [project.id, "stale (reclaimed)"],
  )
  let runRes
  try {
    runRes = await db.query(
      "INSERT INTO analysis_runs (project_id, status, engine_version) VALUES ($1, $2, $3) RETURNING id",
      [project.id, "running", ENGINE_VERSION],
    )
  } catch (err) {
    // analysis_runs_one_running (Partial-Unique-Index): es läuft bereits eine Auswertung für
    // dieses Projekt (Doppelklick / zweiter Disponent / Kollision mit Nacht-Rerun) → 409.
    if (err?.code === "23505") throw new ApiError(409, "Für dieses Projekt läuft bereits eine Auswertung")
    throw err
  }
  const runId = runRes.rows[0].id

  try {
    const result = await analyze({ db, project, corridorM, osrm })

    // Alte Findings ersetzen + Projekt aktualisieren — atomar
    await db.tx(async (q) => {
      await q.query("DELETE FROM findings WHERE project_id = $1", [project.id])
      // T-330: Findings als wenige Multi-Row-INSERTs statt eines INSERT-Round-Trips pro Fund.
      for (const part of chunk(result.findings, BATCH_ROWS)) {
        await q.query(
          `INSERT INTO findings (${FINDING_COLS}) VALUES ${placeholders(part.length, FINDING_COL_COUNT)}`,
          part.flatMap((f) => findingParams(project.id, f)),
        )
      }
      // updated_at NICHT anfassen: die Analyse (v.a. der nächtliche Auto-Rerun über ALLE
      // Projekte) ist keine Nutzer-Bearbeitung. Würde sie updated_at hochziehen, landeten
      // alle Projekte auf der Sync-Zeit und die „zuletzt bearbeitet"-Sortierung auf Home
      // wäre wertlos. updated_at bleibt damit = letzte echte Nutzer-Änderung (T-181).
      await q.query(
        `UPDATE projects SET status = $2, distanz_km = $3, fahrzeit_min = $4 WHERE id = $1`,
        [project.id, "fertig", result.distanzKm, result.fahrzeitMin],
      )
    })

    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "done", JSON.stringify(result.provider), JSON.stringify(result.stats), null],
    )
    return result
  } catch (err) {
    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "error", null, null, String(err?.message ?? err)],
    )
    throw err
  }
}
