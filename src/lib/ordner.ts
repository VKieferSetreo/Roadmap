// Die Pfadrechnung hinter der Ordner-Navigation (T-651).
//
// Sie steht hier und nicht in der Komponente, weil sie auf eine Art falsch sein kann, die man
// beim Hinsehen nicht bemerkt — und weil man sie so ohne React pruefen kann.

// BEWUSST ohne Import aus @/types/domain: die Funktion braucht zwei Felder, und ohne den Alias
// laeuft sie auch in der Server-Testumgebung, die als einzige im Projekt eingerichtet ist.
type Ordner = { id: string; parentId?: string | null }

/**
 * Den Navigationspfad auf das kuerzen, was es wirklich noch gibt.
 *
 * WOZU: man steht in CK → Prysmian → Hamm, und jemand loescht Prysmian (oder man loescht ihn
 * selbst). Ohne diese Pruefung zeigte die Ansicht weiter „Hamm" an, waehrend der Pfad darueber
 * ins Leere zeigt — und der Weg zurueck fuehrt in einen Ordner, den es nicht mehr gibt.
 *
 * Gekuerzt wird bis zum letzten Glied, das noch stimmt. Geprueft wird dabei nicht nur, ob der
 * Ordner existiert, sondern auch, ob die KETTE stimmt: das zweite Glied muss ein Kind des
 * ersten sein. Sonst uebersteht ein verschobener Ordner den Test, obwohl er nicht mehr dort
 * haengt, wo man hingeklickt hat.
 */
export function gueltigerPfad(pfad: string[], folders: Ordner[]): string[] {
  const raus: string[] = []
  for (let i = 0; i < pfad.length; i++) {
    const f = folders.find((x) => x.id === pfad[i])
    if (!f) break
    const elternPasst = i === 0 ? (f.parentId ?? null) === null : f.parentId === pfad[i - 1]
    if (!elternPasst) break
    raus.push(f.id)
  }
  return raus
}
