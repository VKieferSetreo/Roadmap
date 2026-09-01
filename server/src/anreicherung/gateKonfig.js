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

  // EINSTUFIG, anders als im Bestandslauf. Dort bringen drei Rollen gemessen 20 statt 14 Angaben,
  // kosten aber die dreifache Zeit — und hier haengt ein Import daran, der 66 Quellen nacheinander
  // abarbeitet. Vierzig Prozent mehr Ausbeute sind das nicht wert, wenn dafuer das Aktualisieren
  // stockt; was das Gate liegen laesst, holt der naechste Nachlauf mit der vollen Pipeline.
  return {
    modell: konfig.name,
    rufeModell,
    rollen: null,
    // Hoeher als beim Bestandslauf: OpenRouter ist ein fremder Dienst, kein VRAM-Limit. Die
    // Grenze ist dort das Kontingent, nicht unsere Grafikkarte.
    gleichzeitig: Number(env.ANREICHERUNG_GATE_PARALLEL || 8),
    // Nach dieser Zeit gehen die restlichen Punkte roh durch. Ein Import darf nie haengen.
    budgetMs: Number(env.ANREICHERUNG_GATE_BUDGET_MS || 45000),
    // Bremse gegen den Fall, dass eine Quelle einmal ihren gesamten Bestand als "neu" meldet
    // (erster Lauf, Formatwechsel, geaenderte externe_id). Der Rest geht roh durch und wird vom
    // Nachlauf geholt — gemessener Normalfall sind 9 bis 12 neue Punkte je Lauf, groesster
    // beobachteter Einzellauf 295.
    grenze: Number(env.ANREICHERUNG_GATE_MAX || 500),
  }
}
