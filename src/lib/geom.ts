// GeoJSON-Geometrie (LineString/MultiLineString) → Leaflet-Positionen.
// GeoJSON-Koordinaten sind [lng, lat]; Leaflet erwartet [lat, lng].
// Rückgabe: Liste von Linien-Segmenten (auch für eine LineString eine 1-elementige Liste)
// → direkt als positions an <Polyline> (Multi-Polyline) übergebbar.

import type { GeoJSONGeometry } from "@/types/domain"

type LatLng = [number, number]

function toLine(line: unknown): LatLng[] {
  if (!Array.isArray(line)) return []
  const out: LatLng[] = []
  for (const p of line) {
    // Number.isFinite filtert auch NaN/Infinity raus — ein NaN-Punkt vergiftet sonst
    // geomMidpoint und Leaflets Zoom-Recalc (Marker/Linien flackern beim Zoomen).
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push([p[1], p[0]]) // [lng,lat] → [lat,lng]
    }
  }
  return out
}

/** Linien-Segmente einer Geometrie (leer bei Punkt/null/unbekannt). */
export function geomToLines(geom?: GeoJSONGeometry | null): LatLng[][] {
  if (!geom || typeof geom !== "object" || !geom.type) return []
  const coords = geom.coordinates as unknown
  if (geom.type === "LineString") {
    const line = toLine(coords)
    return line.length >= 2 ? [line] : []
  }
  if (geom.type === "MultiLineString") {
    return (Array.isArray(coords) ? coords : [])
      .map(toLine)
      .filter((l) => l.length >= 2)
  }
  return []
}

/** Hat die Geometrie eine darstellbare Strecke (≥1 Linie mit ≥2 Punkten)? */
export function hasLineGeom(geom?: GeoJSONGeometry | null): boolean {
  return geomToLines(geom).length > 0
}

function havKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Teil-Polyline einer Route zwischen kmVon und kmBis (km ab Start, Haversine-kumuliert),
 *  mit interpolierten Endpunkten → sauberes Segment. Fallback-Markierung für Funde ohne eigene
 *  Hindernis-Geometrie (sonst sieht man nur die Fahrbahnlinie). [] wenn nicht darstellbar. */
export function sliceRouteByKm(positions: LatLng[], kmVon: number, kmBis: number): LatLng[] {
  if (!Array.isArray(positions) || positions.length < 2) return []
  const lo = Math.max(0, Math.min(kmVon, kmBis))
  const hi = Math.max(kmVon, kmBis)
  const out: LatLng[] = []
  let cum = 0
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i]
    const b = positions[i + 1]
    const seg = havKm(a, b)
    const segStart = cum
    const segEnd = cum + seg
    if (seg > 0 && segEnd >= lo && segStart <= hi) {
      if (out.length === 0) out.push(lerp(a, b, Math.min(1, Math.max(0, (lo - segStart) / seg))))
      if (segEnd >= hi) {
        out.push(lerp(a, b, Math.min(1, Math.max(0, (hi - segStart) / seg))))
        break
      }
      out.push(b)
    }
    cum = segEnd
  }
  return out.length >= 2 ? out : []
}

/** Mittelpunkt der Strecke (mittlerer Stützpunkt der längsten Linie) — damit der Pin
 *  MITTEN auf der markierten Strecke sitzt statt am Anfang. null bei Punkt/leerer Geometrie. */
export function geomMidpoint(geom?: GeoJSONGeometry | null): LatLng | null {
  const lines = geomToLines(geom)
  if (lines.length === 0) return null
  let longest = lines[0]
  for (const l of lines) if (l.length > longest.length) longest = l
  return longest[Math.floor(longest.length / 2)] ?? null
}

// Max plausible Länge eines GERADEN Liniensegments (km). Echte Straßen-/Bauwerksgeometrie
// folgt der Straße in kurzen Stützpunkt-Abständen; ein einzelner Sprung über mehrere km ist
// kaputte Daten (z.B. 2-Punkt-Linie quer durchs Land) → Linie nicht zeichnen, nur den Punkt.
// ponytail: simpler Max-Segment-Check; Schwelle bewusst großzügig (3 km), damit legitime
// lange Geraden (Autobahn) bleiben und nur eindeutig kaputte Geometrie (10–40 km) rausfällt.
const MAX_SEGMENT_KM = 3

/** true, wenn die Geometrie einen unplausibel langen geraden Sprung enthält (kaputte Daten). */
export function hasImplausibleJump(lines: LatLng[][]): boolean {
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      if (havKm(line[i - 1], line[i]) > MAX_SEGMENT_KM) return true
    }
  }
  return false
}
