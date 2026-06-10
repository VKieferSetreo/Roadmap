// Deterministischer Routen-Fallback, wenn OSRM nicht erreichbar ist.
// Portiert aus src/lib/mock/generate.ts (buildPolyline/buildRouteGeometry):
// Segment-Subdivision + Sinus-Wobble — vollständig seeded, KEIN Math.random.

import { resolveOrt } from "./cities.js"
import { haversineKm } from "./geometry.js"

/** Subdividiert eine Segment-Folge und fügt straßenartige Auslenkung hinzu. */
export function buildPolyline(waypoints) {
  if (waypoints.length < 2) return waypoints
  const out = []
  for (let s = 0; s < waypoints.length - 1; s++) {
    const a = waypoints[s]
    const b = waypoints[s + 1]
    const segKm = haversineKm(a, b)
    const steps = Math.max(8, Math.min(60, Math.round(segKm / 6)))
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      // sanfte Sinus-Auslenkung quer zur Strecke → wirkt wie Straßenverlauf
      const wobble = Math.sin(t * Math.PI * 3) * 0.06 * (1 - Math.abs(t - 0.5) * 2)
      const dx = b.lng - a.lng
      const dy = b.lat - a.lat
      const len = Math.hypot(dx, dy) || 1
      // Normale (senkrecht zur Richtung)
      const nx = -dy / len
      const ny = dx / len
      out.push({
        lat: a.lat + dy * t + ny * wobble,
        lng: a.lng + dx * t + nx * wobble,
      })
    }
  }
  out.push(waypoints[waypoints.length - 1])
  return out
}

/** Upload ohne Punkte: stabiler Demo-Korridor aus dem Dateinamen-Seed. */
export function seedWaypoints(seed) {
  return [resolveOrt(`${seed}-start`), resolveOrt(`${seed}-ziel`)]
}

/** Reduziert eine Geometrie gleichmäßig auf max Punkte (Endpunkte bleiben). */
export function downsample(points, max = 2000) {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)])
  return out
}
