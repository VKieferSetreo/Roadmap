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
import { KATALOG, FELD_ALIAS, setzeRefNormalisierer } from "./felder.js"

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
  if (/^(nicht |kein|unbekannt|k\.?\s?a\.?$|n\/a$|-$|—$)/i.test(beleg) ||
      /^(nicht |kein|unbekannt|k\.?\s?a\.?$|n\/a$|-$|—$)/i.test(String(angabe?.wert ?? ""))) {
    return { ok: false, grund: "Platzhalter statt Angabe" }
  }

  // KEIN BELEG AUS UNSEREM EIGENEN RAHMEN. Der Quelltext ist nicht nur die Meldung, sondern auch
  // die Zeilen, die wir um sie herumbauen ("Art: sperrung", "Richtung: beide", "Vorhandene
  // Angaben: {…}"). Zitiert das Modell die, belegt es unsere Frage mit unserer eigenen Antwort:
  // gemessen 85 von 759 Verwerfungen, darunter "sperrungArt = roadClosed" mit dem Beleg
  // "Vorhandene Angaben: {"sperrungArt":"roadClosed"}". Riegel 1 kann das nicht fangen — die
  // Zeile steht ja wirklich im Text.
  if (RAHMEN_PRAEFIX.test(beleg)) return { ok: false, grund: "Beleg zitiert den Rahmen, nicht die Meldung" }

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
export function bauePrompt(quelltext, felder = Object.keys(FELDER)) {
  const liste = felder.map((f) => `- ${f}: ${FELDER[f].frage}`).join("\n")
  return `Du liest Stammdaten aus einer Bauwerksbeschreibung. Antworte NUR mit JSON.

Gesuchte Angaben:
${liste}

Regeln:
- Gib ein Feld NUR an, wenn es im Text tatsächlich steht. Rate nicht und schließe nichts.
- Zu jedem Feld gehört "beleg": die wörtliche Textstelle, aus der es hervorgeht. Kopiere sie
  Zeichen für Zeichen aus dem Text. Ohne Beleg wird die Angabe verworfen.
- Findest du nichts, gib {"angaben": []} zurück. Das ist eine richtige Antwort, keine schlechte.
- Schreibe NIEMALS Platzhalter wie "nicht angegeben", "nicht anwendbar", "unbekannt" oder "-" als
  Wert, und erfinde keinen Beleg wie "nicht im Text vorhanden". Lass das Feld einfach weg.
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
export async function extrahiere(quelltext, { modell, felder, rufeModell }) {
  const antwort = await rufeModell(bauePrompt(quelltext, felder), modell).catch(() => null)
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
