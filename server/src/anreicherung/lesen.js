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

/** Der Vermerk am Fund. Kurz, weil er neben den Sachangaben steht, und benannt, weil "KI-ergänzt"
 *  ohne Angabe WAS ergänzt wurde niemandem hilft. */
export const anreicherungsVermerk = (ergaenzt) =>
  ergaenzt.length ? ergaenzt.map((f) => KLAR[f] ?? f).join(", ") : null
