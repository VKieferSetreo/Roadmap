// Angereicherte Werte in die Analyse holen — sichtbar gekennzeichnet (T-657).
//
// Max, 31.08.2026: "alle Infos, die potenziell KI-ergänzt sind, brauchen einen kleinen Marker
// auf der jeweiligen Karte."
//
// DIE REGEL, die alles andere bestimmt: ein abgeleiteter Wert füllt nur eine LÜCKE. Er
// überschreibt nie eine gemeldete Angabe, auch dann nicht, wenn er plausibler aussieht. Wo die
// Behörde etwas sagt, gilt die Behörde. Sonst würde eine stille Modellkorrektur zu einer Aussage
// über eine Brücke, für die am Ende jemand geradesteht.
//
// Und: jeder übernommene Wert hinterlässt eine Spur. Ein Fund, dessen Bewertung auf einem
// abgeleiteten Wert beruht, sagt das im Detail — die Oberfläche macht daraus ihr Zeichen.

import { typisiere } from "./einspielen.js"

/** Welche Angaben stammen aus der Anreicherung? Map von obstacle-id auf {feld: {wert, beleg}}. */
export async function ladeAnreicherung(db, obstacleIds, { modell = null } = {}) {
  const ids = [...new Set((obstacleIds ?? []).filter(Boolean).map(String))]
  if (!ids.length) return new Map()
  const werte = modell ? [ids, modell] : [ids]
  const { rows } = await db.query(
    `SELECT ziel_id, feld, wert, beleg, modell
       FROM anreicherung
      WHERE ziel_typ = 'obstacle' AND stand = 'ok' AND ziel_id = ANY($1)
        ${modell ? "AND modell = $2" : ""}
        AND (geprueft IS NULL OR geprueft = true)`,
    werte,
  ).catch(() => ({ rows: [] })) // Tabelle noch nicht migriert → Analyse läuft ohne Anreicherung weiter

  const raus = new Map()
  for (const r of rows) {
    if (!raus.has(r.ziel_id)) raus.set(r.ziel_id, {})
    raus.get(r.ziel_id)[r.feld] = { wert: r.wert, beleg: r.beleg, modell: r.modell }
  }
  return raus
}

/**
 * Die abgeleiteten Werte in ein Hindernis einsetzen — nur in Lücken.
 * @returns {{obstacle: object, ergaenzt: string[]}} ergaenzt = die Felder, die aus der Ableitung kamen
 */
export function mitAnreicherung(obstacle, eintrag) {
  if (!eintrag || !Object.keys(eintrag).length) return { obstacle, ergaenzt: [] }
  const attrs = { ...(obstacle.attrs ?? {}) }
  const ergaenzt = []
  for (const [feld, a] of Object.entries(eintrag)) {
    if (attrs[feld] != null) continue // gemeldete Angabe gewinnt, immer
    // T-664/F1: derselbe Typ wie beim Einspielen. Dieser Pfad baut die Ansicht zur Laufzeit auf,
    // ohne in attrs zu schreiben — kaeme der Wert hier als Text durch, saehe die Anzeige etwas
    // anderes als die Bewertung. Zwei Wahrheiten fuer denselben Punkt sind schlimmer als eine
    // falsche.
    attrs[feld] = typisiere(feld, a.wert)
    ergaenzt.push(feld)
  }
  return ergaenzt.length ? { obstacle: { ...obstacle, attrs }, ergaenzt } : { obstacle, ergaenzt: [] }
}

/** Lesbare Feldnamen fürs Detail — "getrageneStrasse" sagt einem Disponenten nichts. */
const KLAR = {
  getrageneStrasse: "getragene Straße",
  gekreuzteStrasse: "gekreuzte Straße",
  maxHoeheM: "Durchfahrtshöhe",
  maxGewichtT: "Tragfähigkeit",
  maxBreiteM: "Durchfahrtsbreite",
  // Ohne Eintrag stand hier der rohe Feldname aus dem Katalog — "sperrungArt" statt "Art der
  // Sperrung". Der Vermerk steht am Fund und wird gelesen, nicht geparst.
  restbreiteM: "Restbreite",
  maxLaengeM: "zulässige Länge",
  maxAchslastT: "zulässige Achslast",
  verkehrsverbotLkwT: "Lkw-Verbot",
  sperrlaengeM: "Länge der Maßnahme",
  vollsperrung: "Vollsperrung",
  teilsperrung: "Teilsperrung",
  halbseitig: "halbseitige Sperrung",
  fahrbahnVerengt: "verengte Fahrbahn",
  einbahnstrasse: "Einbahnstraße",
  sackgasse: "Sackgasse",
  nurNachts: "nur nachts",
  umleitung: "Umleitung",
  sperrungArt: "Art der Sperrung",
  zeitfenster: "Sperrzeitfenster",
  anzahlFahrstreifen: "Fahrstreifen gesamt",
  spurenGesperrt: "gesperrte Fahrstreifen",
  spurenFrei: "freie Fahrstreifen",
}

/**
 * Welche Zeile im Fund-Detail beruht auf welchem abgeleiteten Feld?
 *
 * Die Regeln schreiben ihre Werte unter fachlichen Namen ins Detail ("Durchfahrtshöhe" statt
 * "maxHoeheM", rules.js Zeile 159 ff.). Damit die Karte das Zeichen AN DER GEFUNDENEN STELLE
 * setzen kann (Max, 31.08.2026), braucht sie diese Zuordnung — sonst wüsste sie nur, DASS etwas
 * ergänzt wurde, aber nicht wo.
 */
const DETAIL_ZEILE = {
  // MEHRERE Labels je Feld, weil dieselbe Groesse je nach Regel anders heisst: ruleBauwerk
  // schreibt "Durchfahrtsbreite", ruleBaustelle "Restbreite". Die erste Fassung kannte nur eines
  // und markierte deshalb eine Zeile, die es im Detail gar nicht gab — sichtbar wurde nichts.
  maxHoeheM: ["Durchfahrtshöhe", "Lichte Höhe"],
  maxBreiteM: ["Durchfahrtsbreite", "Restbreite"],
  restbreiteM: ["Restbreite", "Durchfahrtsbreite"],
  maxGewichtT: ["Zul. Brückenlast", "Zul. Gesamtlast"],
  verkehrsverbotLkwT: ["Zul. Gesamtlast", "Lkw-Verbot ab"],
  maxLaengeM: ["Zul. Länge"],
  maxAchslastT: ["Zul. Achslast"],
  sperrlaengeM: ["Länge der Maßnahme"],
  anzahlFahrstreifen: ["Fahrstreifen (verbleibend)"],
  spurenGesperrt: ["Gesperrte Fahrstreifen"],
  // Am 01.09.2026 an einem Fund auf der A62 aufgefallen: der Vermerk "Durch KI extrahiert" stand
  // am Fund, aber KEIN Wert war markiert. Grund war diese Tabelle — sie kannte zehn der
  // dreiundzwanzig Felder, und ausgerechnet zeitfenster fehlte, obwohl "Sperrzeitfenster" gross
  // im Detail steht. Ohne Eintrag hier findet die Oberflaeche keine Zeile zum Markieren, und der
  // Vermerk haengt in der Luft.
  zeitfenster: ["Sperrzeitfenster"],
  nurNachts: ["Sperrzeitfenster"],
  vollsperrung: ["Sperrung"],
  teilsperrung: ["Sperrung"],
  sperrungArt: ["Sperrung"],
  spurenFrei: ["Fahrstreifen (verbleibend)"],
}

/** Die Detail-Zeilen, die auf einem abgeleiteten Wert beruhen. Das Frontend markiert genau diese. */
export const kiZeilen = (ergaenzt) =>
  [...new Set((ergaenzt ?? []).flatMap((f) => DETAIL_ZEILE[f] ?? []))]

/**
 * Der Vermerk am Fund. Kurz, weil er neben den Sachangaben steht, und benannt, weil "KI-ergänzt"
 * ohne Angabe WAS ergänzt wurde niemandem hilft.
 *
 * MIT DEM WERT, sobald er bekannt ist. Am 01.09.2026 an einer A1-Brücke aufgefallen: der Vermerk
 * sagte "Durch KI extrahiert", und im Fund war kein einziger Wert markiert — weil das abgeleitete
 * Feld die getragene Straße war, und die steht nicht im Detailraster, sondern oben im Kopf
 * ("Brücke · km 187,8 · A1"). Dort kann die Karte nichts markieren. Also muss der Vermerk selbst
 * sagen, worum es geht: "getragene Straße: A1".
 */
export const anreicherungsVermerk = (ergaenzt, attrs = null) =>
  ergaenzt.length
    ? ergaenzt.map((f) => {
        const name = KLAR[f] ?? f
        const wert = attrs?.[f]
        if (wert == null || wert === "") return name
        return `${name}: ${wert === true ? "ja" : wert === false ? "nein" : wert}`
      }).join(", ")
    : null
