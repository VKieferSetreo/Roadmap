// Erst-Login-Begrüßung (T-487): einmal pro Person, rein client-seitig — kein forensisches
// Backend-Tracking nötig (anders als der Haftungsausschluss), das ist nur ein Onboarding-Hinweis.

const KEY = "setreo:welcome:"

/** true, wenn dieser Nutzer den Willkommens-Screen noch nicht gesehen hat. */
export function needsWelcome(email: string | null): boolean {
  if (!email) return false
  try {
    return localStorage.getItem(KEY + email.toLowerCase()) !== "1"
  } catch {
    return false
  }
}

/** Merkt sich, dass der Nutzer den Willkommens-Screen gesehen hat. */
export function markWelcomeSeen(email: string | null): void {
  if (!email) return
  try {
    localStorage.setItem(KEY + email.toLowerCase(), "1")
  } catch {
    // localStorage nicht verfügbar — Screen erscheint nächstes Mal erneut, harmlos.
  }
}
