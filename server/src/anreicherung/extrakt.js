// Stammdaten aus Freitext lesen, ohne dem Modell zu glauben (T-657).
//
// Max, 31.08.2026: "wie deep waere es, jeden neuen Fall durch KI zu jagen, und die soll fehlende
// Metadaten, die sie auslesen kann, schreiben (bspw. auf welcher Strasse die Markierung ist). […]
// da koennen wir dann sicherstellen, dass das Mapping sauber ist und keine falschen Claims
// rauskommen."
//
// DER GRUNDGEDANKE: ein Sprachmodell ist hier ein LESER, kein Zeuge. Es darf nur wiedergeben, was
// im Text steht, und muss die Stelle zeigen. Alles, was es nicht zeigen kann, wird verworfen —
// nicht weil Modelle unehrlich waeren, sondern weil eine erfundene Tragfaehigkeit in einer
// Schwertransport-Auswertung schlimmer ist als eine fehlende.
//
// DIE DREI RIEGEL, in dieser Reihenfolge:
//   1. BELEGPFLICHT   — der Beleg muss WOERTLICH im Quelltext vorkommen. Erfindet das Modell die
//                       Textstelle, faellt der Wert hier durch, ohne dass jemand den Inhalt
//                       beurteilen muesste.
//   2. ABLEITBARKEIT  — der Wert muss sich aus dem Beleg selbst ergeben. "A7" ist nur gueltig,
//                       wenn im Beleg auch A7 steht, nicht irgendwo sonst im Text.
//   3. FORMTREUE      — der Wert muss dem entsprechen, was das Feld erlaubt (Strassennummer,
//                       Meterangabe, Tonnage). Freitext wird nicht durchgereicht.
//
// Erst was alle drei besteht, wird geschrieben, und auch dann getrennt von den Rohdaten
// (siehe migrations/068_anreicherung.sql).

import { createHash } from "node:crypto"
import { normRoadRefWeit } from "../external/osrm.js"
import { KATALOG, FELD_ALIAS, FAHRBAHN_FELDER, nurGehweg, setzeRefNormalisierer } from "./felder.js"

// Der Katalog kennt osrm nicht (sonst haetten wir einen Ringschluss), bekommt den Normalisierer
// also von hier gereicht.
setzeRefNormalisierer(normRoadRefWeit)

/**
 * Die Felder, die abgeleitet werden duerfen — der Katalog steht in felder.js, weil er waechst
 * und die Riegel hier stabil bleiben sollen. Siehe dort auch, warum die Fragen in der Sprache der
 * QUELLE gestellt sind und nicht in der des Datenmodells.
 */
export const FELDER = KATALOG


// HARTE SPERRE (Max, 31.08.2026): "aber Agent darf keine Koordinaten bauen, das darf nur der
// deterministische Pull. Er darf nur Metadaten machen, die wir dann nutzen können."
//
// Eine Koordinate aus einem Sprachmodell waere eine erfundene Ortsangabe, und die legte ein
// Hindernis an eine Stelle, an der es nicht ist. Wo etwas LIEGT, entscheidet ausschliesslich der
// deterministische Weg (Geocoder, OSRM, Quellgeometrie). Das Modell sagt nur, WAS etwas ist.
//
// Zwei Listen, weil "x" als Teilstring jedes "maxHoeheM" traefe: kurze Kuerzel duerfen nur EXAKT
// greifen, sprechende Woerter auch als Teil eines Namens.
const NIEMALS_GENAU = ["lat", "lng", "lon", "x", "y", "z", "wgs", "utm"]
const NIEMALS_ENTHALTEN = ["koordinate", "coordinate", "geom", "position", "rechtswert", "hochwert", "breitengrad", "laengengrad", "längengrad"]
const istOrtsfeld = (feld) => {
  const k = String(feld).toLowerCase()
  return NIEMALS_GENAU.includes(k) || NIEMALS_ENTHALTEN.some((v) => k.includes(v))
}

// Beim Laden des Moduls durchsetzen: ein Ortsfeld im Katalog laesst den Server gar nicht erst
// starten, statt still Koordinaten zu erfinden.
for (const feld of Object.keys(FELDER)) {
  if (istOrtsfeld(feld)) {
    throw new Error(`Anreicherung: "${feld}" ist ein Ortsfeld. Wo etwas liegt, entscheidet der deterministische Weg, nie das Modell.`)
  }
}

export { istOrtsfeld }

/** Hash des Quelltexts. Aendert die Quelle ihren Wortlaut, ist jede Ableitung daraus hinfaellig. */
export const quelleHash = (text) => createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, 16)

/** Vergleichsform: Gross/Klein, Umlaute und Mehrfach-Leerzeichen duerfen den Beleg nicht scheitern
 *  lassen. Alles andere schon — der Beleg soll die Stelle treffen, nicht ungefaehr passen. */
const flach = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * Die Zeilen, die lauf.js um die eigentliche Meldung herumbaut. Sie gehoeren zum Quelltext, sind
 * aber KEINE Quelle: was in "Vorhandene Angaben" steht, wissen wir schon, und "Art: sperrung" ist
 * unsere eigene Kategorisierung. Ein Beleg, der hier beginnt, belegt nichts.
 *
 * Bezeichnung und Beschreibung fehlen mit Absicht — das IST die Meldung.
 */
/**
 * Antworten, die keine sind: sie sagen etwas ueber unsere Frage, nicht ueber den Text.
 *
 * Die Nachsaetze sind der Unterschied zur echten Verneinung — "keine ANGABE" ist ein Platzhalter,
 * "keine UMLEITUNG eingerichtet" eine Aussage ueber die Baustelle. Dazu die reinen Kurzformen,
 * die fuer sich stehen ("k.A.", "n/a", "-").
 */
const PLATZHALTER_WORT = "im text|vorhanden|angegeben|angaben?|genannt|erw(?:ä|ae)hnt|" +
  "verf(?:ü|ue)gbar|anwendbar|bekannt|ermittelbar|ersichtlich|spezifiziert|definiert|" +
  "zutreffend|relevant|extrahierbar|auslesbar"
const PLATZHALTER = new RegExp(
  // beginnt mit einer Verneinung UND traegt irgendwo einen dieser Nachsaetze — dazwischen darf
  // stehen, was will ("nicht im Text VORHANDEN", "keine naeheren ANGABEN")
  `^(?:(?:nicht|kein[a-z]*|unbekannt)\\b.*\\b(?:${PLATZHALTER_WORT})\\b` +
  // oder die reinen Kurzformen, die fuer sich allein stehen
  `|(?:nicht anwendbar|unbekannt|k\\.?\\s?a\\.?|n/a|-|—))\\s*$`,
  "i",
)

/** Ausdrueckliche Verneinung im Beleg. Nur damit ist ein "nein" haltbar, wenn der Beleg sonst
 *  das Stichwort des Feldes traegt ("KEINE Umleitung eingerichtet"). */
const VERNEINT = /\b(kein|keine|keinen|keiner|nicht|ohne|entfällt|entfaellt|aufgehoben|beendet)\b/i

export const RAHMEN_PRAEFIX = /^\s*(Verortet an|Zuständig|Art|Richtung|Gültig|Quelle|Vorhandene Angaben|Ursprungsdaten der Quelle)\s*:/i

/**
 * Prueft EINE Angabe des Modells gegen die drei Riegel.
 * @returns {{ok: true, feld: string, wert: string, beleg: string} | {ok: false, grund: string}}
 */
export function pruefeAngabe(angabe, quelltext) {
  // Erfundene Feldnamen auf die echten abbilden, bevor geprueft wird: "fahrstreifensperrung"
  // meint sperrungArt. Eine richtige Aussage wegen eines falschen Namens zu verlieren waere
  // die teuerste Art von Strenge.
  const roh = angabe?.feld
  const feld = FELDER[roh] ? roh : (FELD_ALIAS[String(roh ?? "").toLowerCase()] ?? roh)
  const regel = FELDER[feld]
  if (!regel) return { ok: false, grund: `unbekanntes Feld: ${feld}` }

  const beleg = String(angabe?.beleg ?? "").trim()
  if (beleg.length < 2) return { ok: false, grund: "kein Beleg angegeben" }

  // Platzhalter-Antworten frueh abfangen. Gemessen an 242 Verwerfungen war das mit Abstand das
  // haeufigste Muster: das Modell schreibt "nicht angegeben" oder "nicht anwendbar" und erfindet
  // dazu den Beleg "nicht im Text vorhanden", statt das Feld wegzulassen. Als eigener Grund
  // erkennbar, damit die Statistik das nicht mit echten Fehlgriffen vermischt.
  // Ein Platzhalter verweist auf UNS ("nicht im Text vorhanden"), eine Verneinung auf die SACHE
  // ("keine Umleitung eingerichtet"). Die erste Fassung sah nur den Anfang und warf beides in
  // einen Topf — damit war ein belegtes Nein grundsaetzlich nicht mehr moeglich, und genau das
  // brauchte der Riegel gegen unbelegte Verneinungen ein paar Zeilen weiter unten.
  if (PLATZHALTER.test(beleg) || PLATZHALTER.test(String(angabe?.wert ?? ""))) {
    return { ok: false, grund: "Platzhalter statt Angabe" }
  }

  // KEIN BELEG AUS UNSEREM EIGENEN RAHMEN. Der Quelltext ist nicht nur die Meldung, sondern auch
  // die Zeilen, die wir um sie herumbauen ("Art: sperrung", "Richtung: beide", "Vorhandene
  // Angaben: {…}"). Zitiert das Modell die, belegt es unsere Frage mit unserer eigenen Antwort:
  // gemessen 85 von 759 Verwerfungen, darunter "sperrungArt = roadClosed" mit dem Beleg
  // "Vorhandene Angaben: {"sperrungArt":"roadClosed"}". Riegel 1 kann das nicht fangen — die
  // Zeile steht ja wirklich im Text.
  if (RAHMEN_PRAEFIX.test(beleg)) return { ok: false, grund: "Beleg zitiert den Rahmen, nicht die Meldung" }

  // Ein Beleg, der NUR den Geh- oder Radweg betrifft, sagt ueber die befahrbare Flaeche nichts.
  if (FAHRBAHN_FELDER.has(feld) && nurGehweg(beleg)) {
    return { ok: false, grund: "Beleg betrifft nur den Geh-/Radweg" }
  }

  // Ein ZAHLENWERT braucht die Einheit oder ein Stichwort im Beleg. In der Durchsicht der ersten
  // 1.193 Angaben war genau eine auffaellig, und zwar diese: maxGewichtT = 250 mit dem Beleg
  // "Ab 250". 250 was? Ohne Einheit ist die Zahl nicht belegt, sondern nur zitiert.
  if (/M$|T$|Min$/.test(feld) && /^\D{0,4}[\d.,]+\D{0,2}$/.test(beleg)) {
    return { ok: false, grund: `Beleg "${beleg}" nennt keine Einheit` }
  }

  // Riegel 1: die Textstelle muss es wirklich geben.
  if (!flach(quelltext).includes(flach(beleg))) return { ok: false, grund: "Beleg steht nicht im Quelltext" }

  // Riegel 3 vor 2, weil die Form auch den Vergleich in Riegel 2 bestimmt.
  const wert = regel.pruefe(angabe?.wert)
  if (wert == null) return { ok: false, grund: `Wert passt nicht zum Feld: ${angabe?.wert}` }

  // Riegel 2: der Wert muss sich aus dem BELEG ergeben, nicht aus dem uebrigen Text. Sonst
  // koennte das Modell eine beliebige Zahl aus dem Dokument an eine beliebige Stelle haengen.
  //
  // Bei Ja/Nein-Feldern greift stattdessen ein STICHWORT: "vollsperrung = ja" hat als Beleg
  // "Vollsperrung der K 82", und das Wort "ja" steht dort naturgemaess nie. Verlangt wird also,
  // dass der Beleg zum Feld passt, nicht dass er die Antwort woertlich enthaelt.
  if (regel.belegMuster) {
    if (!regel.belegMuster.test(beleg)) {
      return { ok: false, grund: `Beleg "${beleg}" passt nicht zum Feld ${feld}` }
    }
    // EIN "NEIN" KANN DAS STICHWORT NICHT ALS BELEG NEHMEN.
    //
    // Das belegMuster prueft, ob der Beleg zum FELD passt — nicht, ob er die AUSSAGE stuetzt. Ein
    // Beleg "halbseitige Sperrung" liess damit auch "halbseitig = nein" durch, und das ist keine
    // Feinheit: am 02.09.2026 standen 227 solcher Angaben im Bestand, darunter 166 von 167 bei
    // halbseitig und 27 von 27 bei fahrbahnVerengt. Also praktisch jedes "nein" dieser Felder war
    // falsch, belegt ausgerechnet mit dem Satz, der das Gegenteil sagt.
    //
    // Ausnahme ist die ausdrueckliche Verneinung: "keine Umleitung eingerichtet" nennt das
    // Stichwort und meint trotzdem nein. Nur dann bleibt ein "nein" stehen.
    if (wert === false && !VERNEINT.test(beleg)) {
      return { ok: false, grund: `Beleg "${beleg}" belegt ein Ja, nicht das gemeldete Nein` }
    }
  } else {
    const ausBeleg = regel.pruefe(beleg)
    if (ausBeleg == null || String(ausBeleg) !== String(wert)) {
      return { ok: false, grund: `Wert ${wert} folgt nicht aus dem Beleg "${beleg}"` }
    }
  }

  return { ok: true, feld, wert: String(wert), beleg }
}

/**
 * Der Auftrag ans Modell. Bewusst knapp und ohne Beispiele mit erfundenen Strassennummern:
 * Beispiele in einem Extraktions-Prompt werden erfahrungsgemaess mit abgeschrieben, wenn das
 * Modell im echten Text nichts findet, und genau das soll hier nicht passieren.
 */
/**
 * @param {string[]|null} schwierig  Felder, an denen ein frueherer Leseversuch am Beleg
 *   gescheitert ist. NUR die Namen, nie die damaligen Werte: stuende der Wert dabei, waere er
 *   eine Vorlage zum Abschreiben, und das Modell suchte sich einen Beleg dazu. Genau diese
 *   Reihenfolge — erst Antwort, dann Begruendung — soll die Belegpflicht verhindern.
 */
export function bauePrompt(quelltext, felder = Object.keys(FELDER), schwierig = null) {
  const liste = felder.map((f) => `- ${f}: ${FELDER[f].frage}`).join("\n")
  const hinweis = schwierig?.length
    ? `\nBei diesem Datensatz ist ein erster Leseversuch an diesen Feldern gescheitert, weil der
Beleg nicht zum Text passte: ${schwierig.join(", ")}.
Sieh dort besonders genau hin und kopiere die Textstelle Zeichen für Zeichen. Findest du auch
jetzt nichts Belegbares, lass das Feld weg — eine erzwungene Antwort ist schlechter als keine.\n`
    : ""
  return `Du liest Stammdaten aus einer Bauwerksbeschreibung. Antworte NUR mit JSON.
${hinweis}

Gesuchte Angaben:
${liste}

Regeln:
- Gib ein Feld NUR an, wenn es im Text tatsächlich steht. Rate nicht und schließe nichts.
- Zu jedem Feld gehört "beleg": die wörtliche Textstelle, aus der es hervorgeht. Kopiere sie
  Zeichen für Zeichen aus dem Text. Ohne Beleg wird die Angabe verworfen.
- Findest du nichts, gib {"angaben": []} zurück. Das ist eine richtige Antwort, keine schlechte.
- Schreibe NIEMALS Platzhalter wie "nicht angegeben", "nicht anwendbar", "unbekannt" oder "-" als
  Wert, und erfinde keinen Beleg wie "nicht im Text vorhanden". Lass das Feld einfach weg.
- Betrifft eine Angabe NUR den Geh- oder Radweg ("Gehweg eingeengt", "Sperrung des Geh-/Radweges"),
  dann sagt sie über die Fahrbahn NICHTS. Melde sie nicht als Sperrung oder Verengung der Fahrbahn.
- Antworte bei Ja/Nein-Fragen NUR, wenn der Text die Sache ausdrücklich nennt. Ein "nein", nur
  weil nichts dasteht, ist keine Angabe und wird verworfen.
- Die Zeile "Verortet an" nennt nur den Ort und sagt NICHT, ob die Straße getragen oder gekreuzt
  wird. Aus dem BEZEICHNUNGSTEXT darfst du die Lage sehr wohl lesen.

Text:
"""
${quelltext}
"""

Antwortform — "feld" ist IMMER einer der oben genannten Namen, niemals "wert" oder "beleg":
{"angaben": [{"feld": "<einer der oben genannten Namen>", "wert": "<der Wert>", "beleg": "<Textstelle>"}]}`
}

/** Das JSON aus der Antwort schaelen. Modelle rahmen es gern in Prosa oder Codeblöcke. */
export function leseAntwort(text) {
  const roh = String(text ?? "")
  const ohneRahmen = roh.replace(/```(?:json)?/gi, "")
  const von = ohneRahmen.indexOf("{")
  const bis = ohneRahmen.lastIndexOf("}")
  if (von < 0 || bis <= von) return null
  try {
    const d = JSON.parse(ohneRahmen.slice(von, bis + 1))
    return Array.isArray(d?.angaben) ? d.angaben : null
  } catch {
    return null
  }
}

/**
 * Ein Datensatz durch das Modell, mit allen Riegeln.
 * @returns {{gueltig: Array, verworfen: Array, rohAntwort: string|null}}
 */
export async function extrahiere(quelltext, { modell, felder, rufeModell, schwierig = null }) {
  const antwort = await rufeModell(bauePrompt(quelltext, felder, schwierig), modell).catch(() => null)
  const angaben = leseAntwort(antwort)
  if (!angaben) return { gueltig: [], verworfen: [], rohAntwort: antwort }

  const gueltig = []
  const verworfen = []
  const gesehen = new Set()
  for (const a of angaben) {
    const p = pruefeAngabe(a, quelltext)
    if (!p.ok) { verworfen.push({ angabe: a, grund: p.grund }); continue }
    // Ein Feld nur einmal. Nennt das Modell zwei getragene Strassen, ist die Aussage nicht
    // eindeutig, und aus einer uneindeutigen Aussage darf kein Stammdatum werden.
    if (gesehen.has(p.feld)) { verworfen.push({ angabe: a, grund: "Feld mehrfach genannt" }); continue }
    gesehen.add(p.feld)
    gueltig.push(p)
  }
  return { gueltig, verworfen, rohAntwort: antwort }
}
