// Logout läuft über das setreo-auth-Gateway (GET /auth/logout an der Domain-Root,
// NICHT unter /roadmap — absoluter Pfad, am Router/Vite-base vorbei).
// Lokal (Dev) gibt es kein Gateway → Hinweis statt 404.

import { toast } from "sonner"

export const LOGOUT_URL = "/auth/logout"

export function handleLogout(): void {
  if (import.meta.env.DEV) {
    toast.info("Abmelden ist nur im Hub (setreo-intern.com) aktiv.")
    return
  }
  window.location.href = LOGOUT_URL
}

/** Initialen aus einer E-Mail (Local-Part), z.B. "mxk@setreo.de" → "MX". */
export function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] || email).trim()
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase() || "?"
}
