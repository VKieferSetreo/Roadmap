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
    attrs[feld] = a.wert
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
}

/** Die Detail-Zeilen, die auf einem abgeleiteten Wert beruhen. Das Frontend markiert genau diese. */
export const kiZeilen = (ergaenzt) =>
  [...new Set((ergaenzt ?? []).flatMap((f) => DETAIL_ZEILE[f] ?? []))]

/** Der Vermerk am Fund. Kurz, weil er neben den Sachangaben steht, und benannt, weil "KI-ergänzt"
 *  ohne Angabe WAS ergänzt wurde niemandem hilft. */
export const anreicherungsVermerk = (ergaenzt) =>
  ergaenzt.length ? ergaenzt.map((f) => KLAR[f] ?? f).join(", ") : null
