// Logout läuft über das Auth-Gateway (GET /auth/logout an der Domain-Root,
// NICHT unter /roadmap — absoluter Pfad, am Router/Vite-base vorbei).
// Funktioniert host-genau auf BEIDEN Einstiegen: setreo-intern.com → setreo-auth,
// app.setreo-cloud.com → setreo-auth-extern. Lokal (Dev) → Hinweis statt 404.

import { toast } from "sonner"

export const LOGOUT_URL = "/auth/logout"

export function handleLogout(): void {
  if (import.meta.env.DEV) {
    toast.info("Abmelden ist nur im Hub (setreo-intern.com) aktiv.")
    return
  }
  window.location.href = LOGOUT_URL
}

/** Initialen aus einer E-Mail: die ersten zwei Buchstaben des Local-Parts (Punkte/Ziffern
 *  übersprungen), z.B. "max.klattig@" → "MA", "m.sachbearbeiter@" → "MS", "mxk@" → "MX". */
export function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] || email).trim()
  const letters = local.replace(/[^\p{L}]/gu, "")
  return (letters || local).slice(0, 2).toUpperCase() || "?"
}
