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
// Gitter-Index (T-Perf): Zelle "ix,iy" → Segment-Startindizes, deren Bbox die Zelle berührt.
// nearestOnRoute mit Index prüft nur die Segmente der Zelle + 8 Nachbarn statt aller ~2000 →
// gleiche Treffer/km, weil die Nachbar-Abdeckung ≥ ~95 m ist (> clipM 60 m > corridorM 20 m): ein
// Segment im Korridor liegt sicher in der Nachbarschaft. Kandidaten werden in aufsteigender
// i-Reihenfolge geprüft → identische Tie-Auflösung wie der lineare Scan (strikt `<`, erstes gewinnt).
const GRID_DEG = 0.002
const gridCellKey = (ix, iy) => ix + "," + iy
export function buildRouteGrid(geometry) {
  const grid = new Map()
  for (let i = 0; i < geometry.length - 1; i++) {
    const a = geometry[i]
    const b = geometry[i + 1]
    const ix0 = Math.floor(Math.min(a.lng, b.lng) / GRID_DEG)
    const ix1 = Math.floor(Math.max(a.lng, b.lng) / GRID_DEG)
    const iy0 = Math.floor(Math.min(a.lat, b.lat) / GRID_DEG)
    const iy1 = Math.floor(Math.max(a.lat, b.lat) / GRID_DEG)
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const k = gridCellKey(ix, iy)
        const arr = grid.get(k)
        if (arr) arr.push(i)
        else grid.set(k, [i])
      }
    }
  }
  return grid
}

export function nearestOnRoute(point, geometry, cum = cumulativeKm(geometry), grid = null) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(point.lat * DEG)
  let best = { distM: Infinity, km: 0 }
  const consider = (i) => {
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

  if (grid) {
    const ix = Math.floor(point.lng / GRID_DEG)
    const iy = Math.floor(point.lat / GRID_DEG)
    const cand = new Set()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(gridCellKey(ix + dx, iy + dy))
        if (arr) for (const i of arr) cand.add(i)
      }
    }
    for (const i of [...cand].sort((p, q) => p - q)) consider(i) // i-Reihenfolge = gleiche Tie-Auflösung
  } else {
    for (let i = 0; i < geometry.length - 1; i++) consider(i)
  }
  // km HIER deterministisch auf 0,02 km (20 m) runden, bevor es gespeichert/verglichen wird.
  // Feines Raster (max ~10 m Abweichung), aber grob genug, dass die Floating-Point-km über
  // Re-Syncs NICHT mehr driftet (Interpolation/Rechenreihenfolge) → kein Phantom-„neu" im
  // Fund-Diff (rerunAll.js) und keine sichtbar verschobenen Baustellen (#9).
  best.km = Math.round(best.km * 50) / 50
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
export function pointAtKm(geometry, cum, km) {
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
 * Verhältnis einer Strecken-Meldung (Linien-Geometrie) zur Route:
 *   "parallel" — liegt auf UNSERER Fahrbahn (deckungsgleich) → relevant, behalten
 *   "opposite" — liegt VERSETZT neben der Route und läuft überwiegend GEGEN die Reiserichtung
 *                (separate Gegenfahrbahn einer Richtungsfahrbahn) → ausblenden
 *   "none"     — zu wenig Evidenz → behalten
 *
 * Zwei Korridore: `coincidentM` (eng, ~Match-Korridor) = „auf unserer Fahrbahn"; `relationM`
 * (weit, deckt die Mittelstreifen-Breite ab) erfasst auch die versetzte Gegenfahrbahn. Je
 * Liniensegment im weiten Korridor:
 *  - Distanz ≤ coincidentM → unsere Fahrbahn (richtungsunabhängig behalten). WICHTIG: coincidentM ist
 *    der ENGE Same-Lane-Radius (~8 m), NICHT der Match-Korridor (20 m) — sonst fiele die nur wenige
 *    Meter daneben liegende Gegenfahrbahn unter „unsere Fahrbahn" und würde nie ausgeblendet.
 *  - versetzt (coincidentM..relationM) → nach lokalem Kurs als gegenläufig / gleichläufig zählen.
 * Behalten, sobald nennenswert (≥ PARALLEL_MIN_KM) auf unserer Fahrbahn. Ausblenden nur, wenn
 * der versetzte Anteil ÜBERWIEGEND gegenläufig ist (klare Gegenfahrbahn) — sonst behalten.
 * So verschwindet die sichtbar daneben liegende Gegenfahrbahn, ohne relevante Funde zu verlieren.
 */
const PARALLEL_MIN_KM = 0.1
export function obstacleRouteRelation(
  obstaclePts, geometry, cum, { coincidentM = 8, relationM = 60, oppositeDeg = 120 } = {},
) {
  if (!Array.isArray(obstaclePts) || obstaclePts.length < 2) return "none"
  const parallelMax = 180 - oppositeDeg
  let onRouteKm = 0
  let oppositeOffKm = 0
  let parallelOffKm = 0
  for (let i = 0; i < obstaclePts.length - 1; i++) {
    const a = obstaclePts[i]
    const b = obstaclePts[i + 1]
    const segKm = haversineKm(a, b)
    if (segKm === 0) continue
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const near = nearestOnRoute(mid, geometry, cum)
    if (near.distM > relationM) continue
    if (near.distM <= coincidentM) { onRouteKm += segKm; continue } // deckungsgleich auf unserer Fahrbahn
    const routeBear = routeBearingAtKm(geometry, cum, near.km)
    if (routeBear == null) continue
    const delta = angleDeltaDeg(bearingDeg(a, b), routeBear)
    if (delta > oppositeDeg) oppositeOffKm += segKm
    else if (delta < parallelMax) parallelOffKm += segKm
  }
  if (onRouteKm >= PARALLEL_MIN_KM) return "parallel" // auf unserer Fahrbahn → behalten
  if (oppositeOffKm >= PARALLEL_MIN_KM && oppositeOffKm > parallelOffKm) return "opposite" // versetzte Gegenfahrbahn → ausblenden
  return "none"
}

// T-603: Länge (km) der Hindernis-Linie, die DECKUNGSGLEICH (≤ coincidentM) auf der Route verläuft —
// also die Strecke, die der Transport tatsächlich AUF dieser Straße fährt. ≈0 ⇒ die Linie KREUZT die
// Route nur (Über-/Unterführung einer gekreuzten Straße), der Transport ist nie auf ihr. Für den
// SEVAS-Kreuzungsfilter: eine Höhen-/Gewichts-/Breitenauflage einer gekreuzten Nebenstraße gilt nicht
// dem Transport. Jedes Segment wird auf ~stepM densifiziert, damit grobe 2-Punkt-Linien nicht
// all-or-nothing nach ihrem Mittelpunkt gewertet werden (sonst zählte eine 150-m-Querstraße ganz
// mit, wenn die Route zufällig nahe ihrem Mittelpunkt kreuzt).
export function coincidentRouteKm(obstaclePts, geometry, cum, coincidentM = 8, grid = null, stepM = 12, alignDeg = 40) {
  if (!Array.isArray(obstaclePts) || obstaclePts.length < 2) return 0
  let onKm = 0
  for (let i = 0; i < obstaclePts.length - 1; i++) {
    const a = obstaclePts[i]
    const b = obstaclePts[i + 1]
    const segKm = haversineKm(a, b)
    if (segKm === 0) continue
    const segBear = bearingDeg(a, b)
    const steps = Math.max(1, Math.round((segKm * 1000) / stepM))
    let inCount = 0
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const pt = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }
      const near = nearestOnRoute(pt, geometry, cum, grid)
      if (near.distM > coincidentM) continue
      // NUR deckungsgleich, wenn die Restriktionslinie hier ~PARALLEL zur Route läuft (Transport
      // fährt AUF dieser Straße). Eine quer kreuzende Straße (≈90°) durchquert zwar das 8-m-Band,
      // läuft aber nicht auf der Route — sonst zählte eine lange 2-Punkt-Querlinie ihr Durchqueren
      // als ~20 m „deckungsgleich" und entkäme dem Kreuzungsfilter (Mess-Artefakt T-603). Parallel
      // in BEIDE Richtungen (Δ≈0 oder ≈180, Gegenfahrbahn derselben Straße) gilt.
      const rb = routeBearingAtKm(geometry, cum, near.km)
      if (rb != null) {
        const d = angleDeltaDeg(segBear, rb)
        if (Math.min(d, 180 - d) > alignDeg) continue
      }
      inCount++
    }
    onKm += segKm * (inCount / (steps + 1))
  }
  return onKm
}

// T-611 (Audit R3): eine Linien-Meldung (Baustelle/Sperrung/Maß-Restriktion mit geom) KREUZT die
// Route nur — sie läuft an einem Autobahndreieck/-kreuz quer über/unter die Route, statt auf oder
// neben ihr entlangzulaufen. Solche Funde gehören der gekreuzten Straße, nicht dem Transport.
// Diskriminator = RICHTUNG: im Match-Korridor überwiegend QUER (≈90°) UND kein nennenswertes Stück
// LÄNGS. Anders als coincidentRouteKm (enger 8-m-Same-Lane-Test) zählt hier der ganze Korridor
// (nearM ≈ Match-Korridor) als „längs" — damit eine durch den Mittelstreifen >8 m VERSETZTE, aber
// gleichläufige Baustelle als aligned zählt und NICHT fälschlich als Kreuzung gedroppt wird
// (Max: „nichts übersehen"). Densifiziert (stepM), damit grobe 2-Punkt-Querlinien nicht über ihren
// zufällig auf der Route liegenden Mittelpunkt als „parallel" durchrutschen.
export function lineCrossesRoute(
  obstaclePts, geometry, cum, grid = null,
  { nearM = 20, alignDeg = 40, transverseDeg = 50, stepM = 12, minTransverseKm = 0.03, maxAlignedKm = 0.05 } = {},
) {
  if (!Array.isArray(obstaclePts) || obstaclePts.length < 2) return false
  let alignedKm = 0
  let transverseKm = 0
  for (let i = 0; i < obstaclePts.length - 1; i++) {
    const a = obstaclePts[i]
    const b = obstaclePts[i + 1]
    const segKm = haversineKm(a, b)
    if (segKm === 0) continue
    const segBear = bearingDeg(a, b)
    const steps = Math.max(1, Math.round((segKm * 1000) / stepM))
    const w = segKm / (steps + 1)
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const pt = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }
      const near = nearestOnRoute(pt, geometry, cum, grid)
      if (near.distM > nearM) continue
      const rb = routeBearingAtKm(geometry, cum, near.km)
      if (rb == null) continue
      const folded = Math.min(angleDeltaDeg(segBear, rb), 180 - angleDeltaDeg(segBear, rb)) // 0=längs, 90=quer
      if (folded <= alignDeg) alignedKm += w
      else if (folded >= transverseDeg) transverseKm += w
    }
  }
  // Kreuzung nur, wenn nennenswert quer UND praktisch kein Längslauf im Korridor (sonst echte,
  // teils mitlaufende Meldung → behalten). Konservativ: im Zweifel behalten.
  return transverseKm >= minTransverseKm && transverseKm > alignedKm && alignedKm < maxAlignedKm
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
export function clipGeomToCorridor(geom, geometry, cum, clipM, { stepM = 15, bridgeM = 60, grid = null } = {}) {
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
    const inCorr = dense.map((c) => nearestOnRoute({ lat: c[1], lng: c[0] }, geometry, cum, grid).distM <= clipM)
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
