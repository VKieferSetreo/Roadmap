// Funde gruppieren: mehrere Funde derselben Maßnahme am ~selben Ort (z.B. beide
// Fahrtrichtungen) gehören zu EINEM Karten-Marker (mit Tabs), gehen aber nicht verloren.

import type { Finding } from "@/types/domain"

const normName = (s?: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

function distM(a: Finding, b: Finding): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

const groupKey = (f: Finding) => `${f.routeId}|${f.kategorie}|${normName(f.titel)}`

/** Funde gleicher Route + Kategorie + (normalisierter) Bezeichnung, die ≤ GROUP_M auseinander
 *  liegen, zu einer Gruppe zusammenfassen (= dieselbe Maßnahme, oft beide Fahrtrichtungen). */
const GROUP_M = 600
export function groupFindings(findings: Finding[]): Finding[][] {
  const groups: Finding[][] = []
  for (const f of findings) {
    const key = groupKey(f)
    const g = groups.find((grp) => groupKey(grp[0]) === key && grp.some((x) => distM(x, f) <= GROUP_M))
    if (g) g.push(f)
    else groups.push([f])
  }
  return groups
}
