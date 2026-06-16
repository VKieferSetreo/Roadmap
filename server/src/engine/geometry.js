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

/** Initialer Kurs in Grad (0 = Nord, im Uhrzeigersinn) von a nach b. */
function bearingDeg(a, b) {
  const lat1 = a.lat * DEG
  const lat2 = b.lat * DEG
  const dLng = (b.lng - a.lng) * DEG
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) / DEG + 360) % 360
}

/** Punkt auf der Route an einer km-Marke (lineare Interpolation zwischen Stützpunkten). */
function pointAtKm(geometry, cum, km) {
  if (geometry.length === 0) return null
  if (km <= 0) return geometry[0]
  const total = cum[cum.length - 1]
  if (km >= total) return geometry[geometry.length - 1]
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= km) {
      const seg = cum[i] - cum[i - 1]
      const t = seg === 0 ? 0 : (km - cum[i - 1]) / seg
      const a = geometry[i - 1]
      const b = geometry[i]
      return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }
    }
  }
  return geometry[geometry.length - 1]
}

/** Kurs einer Linie über ihre Gesamtspanne (erster → letzter Punkt). null, wenn die
 *  Spanne kürzer als minKm ist — dann ist der Kurs zu instabil, um darauf zu filtern. */
export function lineBearingDeg(points, minKm = 0.12) {
  if (!Array.isArray(points) || points.length < 2) return null
  const a = points[0]
  const b = points[points.length - 1]
  if (haversineKm(a, b) < minKm) return null
  return bearingDeg(a, b)
}

/** Lokaler Kurs der Route um eine km-Marke (±windowKm) — die Reiserichtung des
 *  Transports an dieser Stelle. null, wenn das Fenster degeneriert ist. */
export function routeBearingAtKm(geometry, cum, km, windowKm = 0.3) {
  if (!Array.isArray(geometry) || geometry.length < 2) return null
  const total = cum[cum.length - 1]
  const a = pointAtKm(geometry, cum, Math.max(0, km - windowKm))
  const b = pointAtKm(geometry, cum, Math.min(total, km + windowKm))
  if (!a || !b || haversineKm(a, b) < 1e-4) return null
  return bearingDeg(a, b)
}

/** Winkeldifferenz (0..180°) zweier Kurse. */
export function angleDeltaDeg(a, b) {
  const d = Math.abs((a - b) % 360)
  return d > 180 ? 360 - d : d
}

/**
 * Verhältnis einer Strecken-Meldung (Linien-Geometrie) zur Route im Korridor:
 *   "parallel" — überlappt überwiegend MIT der Reiserichtung → relevant, behalten
 *   "opposite" — überlappt NUR/überwiegend gegen die Richtung (Gegenfahrbahn) → ausblenden
 *   "none"     — keine Überlappung im Korridor (oder Punkt) → behalten
 *
 * Längen-gewichtet über alle Linien-Segmente, deren Mittelpunkt im Korridor liegt, mit
 * LOKALEM Segment-Kurs (statt grobem erster→letzter). Robust gegen kurze/verrauschte
 * Stützpunkte und gegen Hin-/Rückfahrt-Routen. Es wird NUR gedroppt, wenn die Linie
 * REIN gegen die Reiserichtung läuft (kein nennenswerter Parallel-Anteil ≥ PARALLEL_MIN_KM).
 * Fährt der Transport die Linie irgendwo in gleicher Richtung (auch nur ein Stück), bleibt
 * sie drin — lieber eine Gegenfahrbahn zeigen als eine relevante Meldung verlieren.
 */
const PARALLEL_MIN_KM = 0.1 // ab so viel Gleichrichtungs-Überlappung gilt die Linie als befahren
export function obstacleRouteRelation(obstaclePts, geometry, cum, corridorM, oppositeDeg = 120) {
  if (!Array.isArray(obstaclePts) || obstaclePts.length < 2) return "none"
  const parallelMax = 180 - oppositeDeg // darunter = klar gleiche Richtung
  let parallelKm = 0
  let oppositeKm = 0
  for (let i = 0; i < obstaclePts.length - 1; i++) {
    const a = obstaclePts[i]
    const b = obstaclePts[i + 1]
    const segKm = haversineKm(a, b)
    if (segKm === 0) continue
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const near = nearestOnRoute(mid, geometry, cum)
    if (near.distM > corridorM) continue
    const routeBear = routeBearingAtKm(geometry, cum, near.km)
    if (routeBear == null) continue
    const delta = angleDeltaDeg(bearingDeg(a, b), routeBear)
    if (delta > oppositeDeg) oppositeKm += segKm
    else if (delta < parallelMax) parallelKm += segKm
    // dazwischen (quer/zweideutig): zählt nicht
  }
  if (parallelKm >= PARALLEL_MIN_KM) return "parallel" // irgendwo gleiche Richtung → behalten
  if (oppositeKm > 0) return "opposite" // rein Gegenfahrbahn → ausblenden
  return "none"
}

/**
 * Clippt die Linien-Geometrie eines Hindernisses auf den Routen-Korridor: behält NUR die
 * Abschnitte, die innerhalb clipM um die Route liegen (= die der Transport tatsächlich
 * durchfährt). Verhindert, dass eine lange Baustellen-Linie auf der Karte weit über den
 * relevanten Streckenteil hinaus gezeichnet wird.
 *
 * Verfahren: Linie auf ≤ stepM densifizieren → je Stützpunkt Distanz zur Route → zusammen-
 * hängende In-Korridor-Läufe bilden; kurze Aussetzer (≤ bridgeM, Digitalisierungs-Rauschen)
 * überbrücken, damit der sichtbare Abschnitt nicht zerfasert. Rückgabe: GeoJSON LineString
 * (ein Lauf) / MultiLineString (mehrere) / null (nichts im Korridor → Aufrufer behält Fallback).
 */
export function clipGeomToCorridor(geom, geometry, cum, clipM, { stepM = 15, bridgeM = 60 } = {}) {
  const lines = []
  if (geom?.type === "LineString") lines.push(geom.coordinates)
  else if (geom?.type === "MultiLineString" && Array.isArray(geom.coordinates)) lines.push(...geom.coordinates)
  else return null

  const bridgeN = Math.max(1, Math.ceil(bridgeM / stepM))
  const outLines = []

  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 2) continue
    // 1) densifizieren ([lng,lat]-Reihenfolge wie GeoJSON beibehalten)
    const dense = []
    for (let i = 0; i < line.length - 1; i++) {
      const a = { lng: line[i][0], lat: line[i][1] }
      const b = { lng: line[i + 1][0], lat: line[i + 1][1] }
      if (!isFiniteLngLat(a) || !isFiniteLngLat(b)) continue
      const n = Math.max(1, Math.ceil((haversineKm(a, b) * 1000) / stepM))
      for (let s = 0; s < n; s++) {
        const t = s / n
        dense.push([a.lng + t * (b.lng - a.lng), a.lat + t * (b.lat - a.lat)])
      }
    }
    const last = line[line.length - 1]
    if (Array.isArray(last)) dense.push(last)
    if (dense.length < 2) continue

    // 2) In-Korridor markieren
    const inCorr = dense.map((c) => nearestOnRoute({ lat: c[1], lng: c[0] }, geometry, cum).distM <= clipM)
    // 3) kurze Aussetzer überbrücken (false-Inseln ≤ bridgeN zwischen true)
    for (let i = 0; i < inCorr.length; i++) {
      if (inCorr[i]) continue
      let j = i
      while (j < inCorr.length && !inCorr[j]) j++
      if (i > 0 && j < inCorr.length && j - i <= bridgeN) {
        for (let k = i; k < j; k++) inCorr[k] = true
      }
      i = j - 1
    }
    // 4) zusammenhängende true-Läufe extrahieren
    let run = []
    for (let i = 0; i < dense.length; i++) {
      if (inCorr[i]) run.push(dense[i])
      else if (run.length >= 2) { outLines.push(run); run = [] }
      else run = []
    }
    if (run.length >= 2) outLines.push(run)
  }

  if (outLines.length === 0) return null
  if (outLines.length === 1) return { type: "LineString", coordinates: outLines[0] }
  return { type: "MultiLineString", coordinates: outLines }
}
function isFiniteLngLat(p) { return Number.isFinite(p.lng) && Number.isFinite(p.lat) }

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
