// White-Label: aus EINER Akzentfarbe (#rrggbb) die komplette primary-Ramp (50–950) berechnen
// und als CSS-Variablen (RGB-Kanäle) auf :root setzen — plus Tab-Titel. Die L-Deltas/S-Ratios
// sind aus der Setreo-Ramp abgeleitet (500 = gewählte Farbe, unangetastet), damit die Abstufungen
// dieselbe Struktur haben wie unsere Akzentfarbe. Logo wird im Header (React) gerendert, nicht hier.

import type { Branding } from "@/types/domain"

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
type Stop = (typeof STOPS)[number]

// Lightness-Offset je Stop relativ zu 500 (aus der Setreo-Ramp gemessen).
const DELTA_L: Record<Stop, number> = { 50: 51, 100: 44, 200: 32, 300: 18, 400: 7, 500: 0, 600: -9, 700: -15, 800: -21, 900: -28, 950: -36 }
// Sättigungs-Faktor je Stop relativ zu 500 (helle Stops leicht entsättigt, mittlere kräftiger).
const SAT_RATIO: Record<Stop, number> = { 50: 0.87, 100: 0.98, 200: 1, 300: 0.95, 400: 0.92, 500: 1, 600: 1.05, 700: 0.92, 800: 0.75, 900: 0.82, 950: 0.88 }

const HEX6 = /^#[0-9a-fA-F]{6}$/
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** #rrggbb → [h 0–360, s 0–100, l 0–100]. */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, Math.round(l * 100)]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h = 0
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [Math.round((h / 6) * 360), Math.round(s * 100), Math.round(l * 100)]
}

/** [h 0–360, s 0–100, l 0–100] → "r g b" (0–255, CSS-Var-Kanäle). */
function hslToChannels(h: number, s: number, l: number): string {
  const sat = s / 100
  const lig = l / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hh = h / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = lig - c / 2
  return [r, g, b].map((v) => Math.round((v + m) * 255)).join(" ")
}

/** Aus einem Hex die 11-stufige primary-Ramp als CSS-Var-Kanäle. 500 = exakt die gewählte Farbe. */
export function primaryRampFromHex(hex: string): Record<Stop, string> {
  const [h, s, l] = hexToHsl(hex)
  // 500 = die gewählte Farbe exakt (HSL-Roundtrip würde ±1 driften; Button-Farbe = Marke).
  const exact500 = `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`
  const out = {} as Record<Stop, string>
  for (const stop of STOPS) {
    out[stop] = stop === 500 ? exact500 : hslToChannels(h, clamp(s * SAT_RATIO[stop], 0, 100), clamp(l + DELTA_L[stop], 4, 97))
  }
  return out
}

/** Branding global anwenden: primary-CSS-Variablen setzen/zurücksetzen + Tab-Titel.
 *  Idempotent — bei jedem Kontext-Load aufrufbar. */
export function applyBranding(branding?: Branding | null): void {
  const root = document.documentElement
  const accent = branding?.accent ?? undefined
  if (accent && HEX6.test(accent)) {
    const ramp = primaryRampFromHex(accent)
    for (const stop of STOPS) root.style.setProperty(`--primary-${stop}`, ramp[stop])
  } else {
    // zurück auf Setreo-Standard (globals.css :root greift wieder)
    for (const stop of STOPS) root.style.removeProperty(`--primary-${stop}`)
  }
  const appName = branding?.appName?.trim()
  document.title = appName || "Roadmap — Setreo"
}
