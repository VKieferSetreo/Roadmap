// Der Modellzugang fuer das Gate im laufenden Betrieb (T-660).
//
// EINE Stelle, an der entschieden wird, ob und womit das Gate laeuft — die drei Aufrufer des
// Imports (sync.js, worker/index.js, routes/adminImport.js) sollen diese Entscheidung nicht je
// fuer sich treffen und dabei auseinanderlaufen.
//
// IM BETRIEB AUSSCHLIESSLICH OPENROUTER (Max, 31.08.2026: "fuer Prod kein Workstation nur
// OpenRouter"). Der Grund ist Betriebssicherheit, nicht Qualitaet: die Workstation steht bei Max
// unter dem Schreibtisch und ist die meiste Zeit aus. Ein Importpfad, der auf einen Rechner
// wartet, den niemand eingeschaltet hat, blockiert oder faellt still aus.
//
// KEIN SCHLUESSEL, KEIN GATE. Dann laeuft der Import wie vor T-660, und der Nachlauf holt die
// Punkte spaeter — das ist der Zustand, in dem das System monatelang lief, also kein Rueckschritt.

import { createModell, modellKonfig } from "./modell.js"

/**
 * @returns {{modell: string, rufeModell: Function, rollen: object, gleichzeitig: number, grenze: number}|null}
 */
export function gateKonfig({ env = process.env } = {}) {
  if (env.ANREICHERUNG_GATE === "aus") return null
  const konfig = modellKonfig(env.ANREICHERUNG_GATE_WEG || "openrouter", env)
  if (!konfig.verfuegbar) return null

  // Kuerzeres Zeitlimit als beim Bestandslauf: dort durfte ein Aufruf zwei Minuten brauchen, weil
  // niemand darauf wartete. Hier haengt ein Import daran, und der laeuft 140 mal am Tag.
  const rufeModell = createModell(konfig, { timeoutMs: Number(env.ANREICHERUNG_GATE_TIMEOUT_MS || 30000) })

  // Drei Rollen wie im Bestandslauf: gemessen 14 Angaben einstufig gegen 20 dreistufig. Bei neun
  // bis zwoelf neuen Punkten je Lauf ist der dreifache Aufwand keine spuerbare Groesse.
  return {
    modell: konfig.name,
    rufeModell,
    rollen: { liest: rufeModell, prueft: rufeModell, nimmtAb: rufeModell },
    gleichzeitig: Number(env.ANREICHERUNG_GATE_PARALLEL || 4),
    // Bremse gegen den Fall, dass eine Quelle einmal ihren gesamten Bestand als "neu" meldet
    // (erster Lauf, Formatwechsel, geaenderte externe_id). Der Rest geht roh durch und wird vom
    // Nachlauf geholt — gemessener Normalfall sind 9 bis 12 neue Punkte je Lauf, groesster
    // beobachteter Einzellauf 295.
    grenze: Number(env.ANREICHERUNG_GATE_MAX || 500),
  }
}
