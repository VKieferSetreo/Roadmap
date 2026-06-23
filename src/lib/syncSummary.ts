// Gemeinsame Ehrlichkeits-Zusammenfassung eines abgeschlossenen Sync-Laufs (T-472/T-233):
// importierte Einträge + neue Benachrichtigungen, und — wichtig — still gescheiterte oder
// unvollständige Quellen explizit benennen, statt pauschalen Erfolg zu melden (0147-Fall).
// Wird von SyncBar (DB-Tab) und HeaderSync (globaler Button) geteilt.

import type { SyncJob } from "@/types/domain"

export function summarizeRuns(j: SyncJob): { text: string; hasProblem: boolean } {
  const importiert = j.runs.reduce((s, r) => s + (r.stats?.neu ?? 0), 0)
  const fehler = j.runs.filter((r) => r.status === "error").length
  const teil = j.runs.filter((r) => r.status === "partial").length
  const probleme = [
    fehler > 0 && `${fehler} Quelle${fehler === 1 ? "" : "n"} nicht erreichbar`,
    teil > 0 && `${teil} unvollständig`,
  ]
    .filter(Boolean)
    .join(", ")
  // T-367: die Re-Analyse bekam den globalen Lock nicht (läuft schon im Hintergrund) → es gibt noch
  // KEINE Fund-/Benachrichtigungs-Bilanz. Ehrlich sagen statt pauschalen Erfolg, aber kein Fehler.
  if (j.rerun?.skipped) {
    const base = `Aktualisiert · ${importiert} neue Einträge · Auswertung läuft noch im Hintergrund`
    return { text: probleme ? `${base} · ${probleme}` : base, hasProblem: Boolean(probleme) }
  }
  const neu = j.rerun?.benachrichtigungen ?? 0
  const text =
    `Aktualisiert · ${importiert} neue Einträge` +
    (neu > 0 ? ` · ${neu} neue Benachrichtigung${neu === 1 ? "" : "en"}` : "") +
    (probleme ? ` · ${probleme}` : "")
  return { text, hasProblem: Boolean(probleme) }
}
