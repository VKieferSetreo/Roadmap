// Die zwei Rechnungen hinter der Ordner-Navigation (T-651).
//
// Sie stehen hier und nicht in der Komponente, weil sie beide auf eine Art falsch sein
// koennen, die man beim Hinsehen nicht bemerkt — und weil man sie so ohne React pruefen kann.

// BEWUSST ohne Import aus @/types/domain: die beiden Funktionen brauchen nur zwei bzw. ein
// Feld, und ohne den Alias laufen sie auch in der Server-Testumgebung, die als einzige im
// Projekt eingerichtet ist. Strukturelle Typen genuegen dafuer vollstaendig.
type Ordner = { id: string; parentId?: string | null }
type Projekt = { folderId?: string | null }

/**
 * Wie viele Projekte in diesem Ordner UND in allem darunter liegen.
 *
 * WARUM NICHT NUR DIE EIGENEN: die Zahl steht an einer Ordnerzeile, hinter der man nichts
 * mehr sieht — genau das ist der Sinn der neuen Navigation. Zaehlte sie nur die direkten,
 * stuende an CK eine 15, obwohl 40 Projekte darin haengen, und der Ordner saehe leerer aus,
 * als er ist. Bei der alten Baumansicht war das verzeihlich: dort sah man die Unterordner
 * ja aufgeklappt daneben.
 *
 * Zyklen kann es nicht geben (der Server verhindert sie beim Verschieben), aber die Funktion
 * haelt sie trotzdem aus: `gesehen` bricht eine Schleife ab, statt den Aufrufer zu haengen.
 */
export function anzahlTief(
  folderId: string,
  folders: Ordner[],
  projects: Projekt[],
  gesehen: Set<string> = new Set(),
): number {
  if (gesehen.has(folderId)) return 0
  gesehen.add(folderId)
  let n = projects.filter((p) => (p.folderId ?? null) === folderId).length
  for (const kind of folders.filter((f) => (f.parentId ?? null) === folderId)) {
    n += anzahlTief(kind.id, folders, projects, gesehen)
  }
  return n
}

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
