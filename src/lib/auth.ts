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

/** Initialen aus E-Mail/Name (kanonisch, projektweit einheitlich): bei zwei Teilen
 *  (vorname.nachname / "Vorname Nachname") die Anfangsbuchstaben beider, sonst die
 *  ersten zwei Buchstaben. z.B. "max.klattig@" → "MK", "lw@" → "LW", "Stefanie S…" → "SS". */
export function initialsFromEmail(seed: string): string {
  const raw = (seed || "").includes("@") ? (seed || "").split("@")[0] : seed || ""
  const parts = raw.split(/[.\-_\s]+/).filter(Boolean)
  const two = parts.length >= 2 ? (parts[0][0] ?? "") + (parts[1][0] ?? "") : raw.slice(0, 2)
  return (two || "?").toUpperCase().slice(0, 2)
}

// Kanonischer Avatar projektweit (wie Hub/Terminfinder): gefüllter Kreis, weiße fette
// Initialen, Farbe deterministisch je Seed — hsl(hue 55% 45%), hue = Σ(charCode*31) mod 360.
export function avatarHue(seed: string): number {
  const s = seed || "?"
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export function avatarBg(seed: string): string {
  return `hsl(${avatarHue(seed)} 55% 45%)`
}
