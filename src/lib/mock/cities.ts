// Grobe Koordinaten gängiger deutscher Städte für die Mock-Routenerzeugung.
// Frontend-only: ersetzt einen echten Geocoder.

import type { RoutePoint } from "@/types/domain"

export const CITY_COORDS: Record<string, RoutePoint> = {
  hamburg: { lat: 53.5511, lng: 9.9937 },
  bremen: { lat: 53.0793, lng: 8.8017 },
  hannover: { lat: 52.3759, lng: 9.732 },
  berlin: { lat: 52.52, lng: 13.405 },
  leipzig: { lat: 51.3397, lng: 12.3731 },
  dresden: { lat: 51.0504, lng: 13.7373 },
  magdeburg: { lat: 52.1205, lng: 11.6276 },
  dortmund: { lat: 51.5136, lng: 7.4653 },
  essen: { lat: 51.4556, lng: 7.0116 },
  duisburg: { lat: 51.4344, lng: 6.7623 },
  düsseldorf: { lat: 51.2277, lng: 6.7735 },
  köln: { lat: 50.9375, lng: 6.9603 },
  bonn: { lat: 50.7374, lng: 7.0982 },
  frankfurt: { lat: 50.1109, lng: 8.6821 },
  wiesbaden: { lat: 50.0782, lng: 8.2398 },
  mannheim: { lat: 49.4875, lng: 8.466 },
  stuttgart: { lat: 48.7758, lng: 9.1829 },
  karlsruhe: { lat: 49.0069, lng: 8.4037 },
  ulm: { lat: 48.4011, lng: 9.9876 },
  augsburg: { lat: 48.3705, lng: 10.8978 },
  münchen: { lat: 48.1351, lng: 11.582 },
  nürnberg: { lat: 49.4521, lng: 11.0767 },
  würzburg: { lat: 49.7913, lng: 9.9534 },
  kassel: { lat: 51.3127, lng: 9.4797 },
  erfurt: { lat: 50.9848, lng: 11.0299 },
  kiel: { lat: 54.3233, lng: 10.1228 },
  rostock: { lat: 54.0924, lng: 12.0991 },
  saarbrücken: { lat: 49.2402, lng: 6.9969 },
  freiburg: { lat: 47.999, lng: 7.8421 },
  regensburg: { lat: 49.0134, lng: 12.1016 },
}

/** Mittelpunkt Deutschlands — Fallback-Anker. */
const GERMANY_CENTER: RoutePoint = { lat: 51.1657, lng: 10.4515 }

/** Deterministischer String-Hash (FNV-1a-artig). */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Löst einen Ortsnamen zu Koordinaten auf. Bekannte Städte exakt,
 * sonst ein stabiler Pseudo-Punkt innerhalb Deutschlands (damit auch
 * fiktive Orte eine reproduzierbare Position auf der Karte bekommen).
 */
export function resolveOrt(name: string): RoutePoint {
  const key = name.trim().toLowerCase()
  if (CITY_COORDS[key]) return CITY_COORDS[key]
  // Teilstring-Treffer (z.B. "Frankfurt am Main")
  for (const [city, coord] of Object.entries(CITY_COORDS)) {
    if (key.includes(city)) return coord
  }
  const h = hashString(key)
  // Streuung ±2.8° lat / ±3.5° lng um die Mitte → bleibt grob in DE.
  const lat = GERMANY_CENTER.lat + (((h & 0xffff) / 0xffff) * 2 - 1) * 2.8
  const lng = GERMANY_CENTER.lng + ((((h >> 16) & 0xffff) / 0xffff) * 2 - 1) * 3.5
  return { lat, lng }
}
