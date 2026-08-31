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

/** Zahl aus deutscher Schreibweise ("3,80" wie "3.80"). null, wenn es keine ist. */
function zahl(s) {
  const t = String(s ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
  if (!t) return null
  const n = Number(t[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Die Felder, die abgeleitet werden duerfen, samt ihrer Formprobe.
 *
 * WARUM EINE FESTE LISTE und kein freies Schema: ein Modell, das schreiben darf was es will,
 * fuellt irgendwann Felder, die niemand erwartet, und deren Werte nirgends geprueft werden.
 * Jedes Feld hier hat eine Probe, die den Wert in die Form bringt oder ihn verwirft.
 */
// HARTE SPERRE (Max, 31.08.2026): "aber Agent darf keine Koordinaten bauen, das darf nur der
// deterministische Pull. Er darf nur Metadaten machen, die wir dann nutzen können."
//
// Der Grund ist zwingend: eine Koordinate aus einem Sprachmodell waere eine erfundene Ortsangabe,
// und eine erfundene Ortsangabe legt ein Hindernis an eine Stelle, an der es nicht ist. Wo etwas
// LIEGT, entscheidet ausschliesslich der deterministische Weg (Geocoder, OSRM, Quellgeometrie).
// Das Modell sagt nur, WAS etwas ist.
//
// Die Sperre steht hier als Liste und wird beim Modulstart geprueft, damit sie auch dann greift,
// wenn jemand spaeter ein Feld ergaenzt, ohne diesen Kommentar zu lesen.
// Zwei Listen, weil "x" als Teilstring jedes "maxHoeheM" trifft: kurze Kuerzel duerfen nur
// EXAKT greifen, sprechende Woerter auch als Teil eines Namens.
const NIEMALS_GENAU = ["lat", "lng", "lon", "x", "y", "z", "wgs", "utm"]
const NIEMALS_ENTHALTEN = ["koordinate", "coordinate", "geom", "position", "rechtswert", "hochwert", "breitengrad", "laengengrad", "längengrad"]
const istOrtsfeld = (feld) => {
  const k = String(feld).toLowerCase()
  return NIEMALS_GENAU.includes(k) || NIEMALS_ENTHALTEN.some((v) => k.includes(v))
}

export const FELDER = {
  getrageneStrasse: {
    frage: "Welche Straße führt ÜBER dieses Bauwerk, wird also von ihm getragen?",
    pruefe: (roh) => normRoadRefWeit(roh),
  },
  gekreuzteStrasse: {
    frage: "Welche Straße wird von diesem Bauwerk überquert, verläuft also darunter?",
    pruefe: (roh) => normRoadRefWeit(roh),
  },
  maxHoeheM: {
    frage: "Welche lichte Durchfahrtshöhe in Metern ist genannt?",
    // Unter 2 m ist keine Durchfahrt mehr, ueber 10 m keine Beschraenkung: beides waere
    // eine falsch gelesene Zahl (Stationierung, Baujahr, Bauwerksnummer).
    pruefe: (roh) => { const n = zahl(roh); return n != null && n >= 2 && n <= 10 ? n : null },
  },
  maxGewichtT: {
    frage: "Welche zulässige Gesamtmasse in Tonnen ist genannt?",
    pruefe: (roh) => { const n = zahl(roh); return n != null && n >= 3 && n <= 1000 ? n : null },
  },
  maxBreiteM: {
    frage: "Welche zulässige Durchfahrtsbreite in Metern ist genannt?",
    pruefe: (roh) => { const n = zahl(roh); return n != null && n >= 1.5 && n <= 20 ? n : null },
  },
}

// Die Sperre beim Laden des Moduls durchsetzen: ein Ortsfeld in FELDER laesst den Server gar
// nicht erst starten, statt still Koordinaten zu erfinden.
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
 * Prueft EINE Angabe des Modells gegen die drei Riegel.
 * @returns {{ok: true, feld: string, wert: string, beleg: string} | {ok: false, grund: string}}
 */
export function pruefeAngabe(angabe, quelltext) {
  const feld = angabe?.feld
  const regel = FELDER[feld]
  if (!regel) return { ok: false, grund: `unbekanntes Feld: ${feld}` }

  const beleg = String(angabe?.beleg ?? "").trim()
  if (beleg.length < 2) return { ok: false, grund: "kein Beleg angegeben" }

  // Riegel 1: die Textstelle muss es wirklich geben.
  if (!flach(quelltext).includes(flach(beleg))) return { ok: false, grund: "Beleg steht nicht im Quelltext" }

  // Riegel 3 vor 2, weil die Form auch den Vergleich in Riegel 2 bestimmt.
  const wert = regel.pruefe(angabe?.wert)
  if (wert == null) return { ok: false, grund: `Wert passt nicht zum Feld: ${angabe?.wert}` }

  // Riegel 2: derselbe Wert muss sich aus dem BELEG ergeben, nicht aus dem uebrigen Text. Sonst
  // koennte das Modell eine beliebige Zahl aus dem Dokument an eine beliebige Stelle haengen.
  const ausBeleg = regel.pruefe(beleg)
  if (ausBeleg == null || String(ausBeleg) !== String(wert)) {
    return { ok: false, grund: `Wert ${wert} folgt nicht aus dem Beleg "${beleg}"` }
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
- Eine bloße Ortsangabe ("liegt an der Straße …") sagt NICHT, ob diese Straße getragen oder
  gekreuzt wird. Leite daraus keine der beiden Angaben ab.

Text:
"""
${quelltext}
"""

Antwortform:
{"angaben": [{"feld": "...", "wert": "...", "beleg": "..."}]}`
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
