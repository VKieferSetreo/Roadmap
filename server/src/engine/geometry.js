// Geometrie-Helfer: Haversine, kumulative km-Marken, Punkt-zu-Polyline-Distanz.
// Für die Segment-Projektion reicht eine äquirektangulare Näherung (kleine Distanzen).

const DEG = Math.PI / 180
const EARTH_R_KM = 6371
const M_PER_DEG_LAT = 111_320

/** Haversine-Distanz in km zwischen zwei Punkten. */
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG
  const dLng = (b.lng - a.lng) * DEG
  const lat1 = a.lat * DEG
  const lat2 = b.lat * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(h))
}

/** Kumulative km-Marke je Geometrie-Punkt (Index 0 = 0 km). */
export function cumulativeKm(points) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineKm(points[i - 1], points[i]))
  }
  return cum
}

export function totalKm(points) {
  let sum = 0
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i])
  return sum
}

/**
 * Kürzeste Distanz eines Punktes zur Polyline (Meter) + km-Position des
 * Lotfußpunkts entlang der Route. cum kann vorberechnet übergeben werden.
 */
export function nearestOnRoute(point, geometry, cum = cumulativeKm(geometry)) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(point.lat * DEG)
  let best = { distM: Infinity, km: 0 }

  for (let i = 0; i < geometry.length - 1; i++) {
    const a = geometry[i]
    const b = geometry[i + 1]
    // lokale Meter-Koordinaten relativ zum Punkt
    const ax = (a.lng - point.lng) * mPerDegLng
    const ay = (a.lat - point.lat) * M_PER_DEG_LAT
    const bx = (b.lng - point.lng) * mPerDegLng
    const by = (b.lat - point.lat) * M_PER_DEG_LAT
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lenSq))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const distM = Math.hypot(cx, cy)
    if (distM < best.distM) {
      best = { distM, km: cum[i] + t * (cum[i + 1] - cum[i]) }
    }
  }
  return best
}

/** Bounding-Box der Geometrie, um pufferM (Meter) erweitert — für den SQL-Vorfilter. */
export function bboxWithBuffer(geometry, pufferM) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of geometry) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  const latPad = pufferM / M_PER_DEG_LAT
  // konservativ: kleinster cos über die Route → größter Pad
  const maxAbsLat = Math.max(Math.abs(minLat), Math.abs(maxLat))
  const lngPad = pufferM / (M_PER_DEG_LAT * Math.max(0.2, Math.cos(maxAbsLat * DEG)))
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  }
}
