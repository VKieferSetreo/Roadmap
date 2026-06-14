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
    if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") {
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
