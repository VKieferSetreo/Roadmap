// Projektgrenzen für Markierungs-Ebenen (T-742) — geteilt vom Upload-Block und vom Kopieren in ein
// anderes Projekt. Vorher stand die Prüfung nur im Upload-Block; das Kopieren braucht dieselbe, nur
// gegen das ZIELprojekt. Die Punktzahl je Ebene prüft der Parser beim Einlesen.

import { MARKIERUNG_GRENZEN, type MarkierungsEbene, type Markierung } from "@/types/domain"

export type GrenzVerstoss =
  | { grund: "ebenen"; ist: number; erlaubt: number }
  | { grund: "punkte"; ist: number; erlaubt: number }
  | { grund: "bytes"; ist: number; erlaubt: number }

/** null = passt. Sonst der erste Verstoß, die Formulierung überlässt die Prüfung dem Aufrufer —
 *  im Auswahldialog heißt die Abhilfe „weniger anhaken", beim Kopieren „anderes Projekt wählen". */
export function pruefeMarkierungsGrenzen(
  bestehend: MarkierungsEbene[],
  neu: Array<{ punkte: Markierung[] }>,
): GrenzVerstoss | null {
  const ebenen = bestehend.length + neu.length
  if (ebenen > MARKIERUNG_GRENZEN.ebenenJeProjekt) {
    return { grund: "ebenen", ist: ebenen, erlaubt: MARKIERUNG_GRENZEN.ebenenJeProjekt }
  }
  // `anzahl` zuerst: eine Ebene in Listen-Fassung trägt ihre Punkte nur als Zähler.
  const punkte =
    bestehend.reduce((n, e) => n + (e.anzahl ?? e.punkte.length), 0) + neu.reduce((n, e) => n + e.punkte.length, 0)
  if (punkte > MARKIERUNG_GRENZEN.punkteJeProjekt) {
    return { grund: "punkte", ist: punkte, erlaubt: MARKIERUNG_GRENZEN.punkteJeProjekt }
  }
  // Die Zählgrenzen deckeln keine Bytes (T-744): viele lange Attribute reißen den 20-MB-Body schon
  // bei erlaubter Punktzahl.
  const bytes = new Blob([JSON.stringify([...bestehend, ...neu])]).size
  if (bytes > MARKIERUNG_GRENZEN.jsonBytes) {
    return { grund: "bytes", ist: bytes, erlaubt: MARKIERUNG_GRENZEN.jsonBytes }
  }
  return null
}

const mb = (b: number) => (b / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })

/** Der Befund als Satz, ohne Abhilfe — die hängt der Aufrufer an. */
export function grenzText(v: GrenzVerstoss): string {
  if (v.grund === "ebenen") return `Ein Projekt fasst höchstens ${v.erlaubt} Ebenen, es wären ${v.ist}.`
  if (v.grund === "punkte") {
    return `Zusammen wären das ${v.ist.toLocaleString("de-DE")} Markierungen, erlaubt sind ${v.erlaubt.toLocaleString("de-DE")} je Projekt.`
  }
  return `Die Markierungen wären zusammen ${mb(v.ist)} MB groß, erlaubt sind ${mb(v.erlaubt)} MB.`
}
