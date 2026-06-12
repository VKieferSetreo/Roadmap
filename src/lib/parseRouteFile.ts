// Client-seitiges Parsen von Streckendateien (GPX / KML / GeoJSON) per DOMParser —
// keine externen Libs. Shapefiles (.shp/.zip) werden akzeptiert, aber (noch) nicht
// geparst → Rückgabe null, die Analyse nutzt dann den deterministischen Fallback.

import type { RoutePoint } from "@/types/domain"

export interface ParsedRoute {
  points: RoutePoint[]
  format: "gpx" | "kml" | "geojson" | "shp"
}

const MAX_POINTS = 1500

/** Gleichmäßiges Downsampling auf maximal MAX_POINTS (Start/Ende bleiben erhalten). */
function downsample(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= MAX_POINTS) return points
  const step = (points.length - 1) / (MAX_POINTS - 1)
  const out: RoutePoint[] = []
  for (let i = 0; i < MAX_POINTS; i++) out.push(points[Math.round(i * step)])
  return out
}

function isValidPoint(p: RoutePoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  )
}

function parseGpx(text: string): RoutePoint[] {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  if (doc.querySelector("parsererror")) throw new Error("GPX-Datei konnte nicht gelesen werden.")
  // Track-Punkte bevorzugen, sonst Routen-Punkte, sonst Wegpunkte.
  for (const sel of ["trkpt", "rtept", "wpt"]) {
    const nodes = Array.from(doc.getElementsByTagName(sel))
    if (nodes.length >= 2) {
      return nodes.map((n) => ({
        lat: Number(n.getAttribute("lat")),
        lng: Number(n.getAttribute("lon")),
      }))
    }
  }
  throw new Error("GPX-Datei enthält keine Strecke (trkpt/rtept).")
}

function parseKml(text: string): RoutePoint[] {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  if (doc.querySelector("parsererror")) throw new Error("KML-Datei konnte nicht gelesen werden.")
  const out: RoutePoint[] = []
  for (const node of Array.from(doc.getElementsByTagName("coordinates"))) {
    const tuples = (node.textContent ?? "").trim().split(/\s+/)
    for (const t of tuples) {
      const [lng, lat] = t.split(",").map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng })
    }
  }
  if (out.length < 2) throw new Error("KML-Datei enthält keine Strecken-Koordinaten.")
  return out
}

type GeoJsonGeometry = {
  type?: string
  coordinates?: unknown
  geometry?: GeoJsonGeometry
  geometries?: GeoJsonGeometry[]
  features?: GeoJsonGeometry[]
}

function collectGeoJson(node: GeoJsonGeometry, out: RoutePoint[]): void {
  if (!node || typeof node !== "object") return
  const pushLine = (coords: unknown) => {
    if (!Array.isArray(coords)) return
    for (const c of coords) {
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
        out.push({ lat: c[1], lng: c[0] })
      }
    }
  }
  switch (node.type) {
    case "LineString":
      pushLine(node.coordinates)
      break
    case "MultiLineString":
      if (Array.isArray(node.coordinates)) node.coordinates.forEach(pushLine)
      break
    case "FeatureCollection":
      node.features?.forEach((f) => collectGeoJson(f, out))
      break
    case "Feature":
      if (node.geometry) collectGeoJson(node.geometry, out)
      break
    case "GeometryCollection":
      node.geometries?.forEach((g) => collectGeoJson(g, out))
      break
  }
}

function parseGeoJson(text: string): RoutePoint[] {
  let parsed: GeoJsonGeometry
  try {
    parsed = JSON.parse(text) as GeoJsonGeometry
  } catch {
    throw new Error("GeoJSON-Datei konnte nicht gelesen werden.")
  }
  const out: RoutePoint[] = []
  collectGeoJson(parsed, out)
  if (out.length < 2) throw new Error("GeoJSON enthält keine Strecke (LineString).")
  return out
}

/** Shapefile (.zip mit .shp/.dbf/.prj ODER nacktes .shp) via shpjs → RoutePoint[].
 *  shpjs reprojiziert über die .prj nach WGS84 (Behörden liefern oft UTM/EPSG:25832). */
async function parseShapefile(file: File, isZip: boolean): Promise<RoutePoint[]> {
  const { default: shp } = await import("shpjs") // lazy — hält den Haupt-Bundle klein
  const buffer = await file.arrayBuffer()
  const out: RoutePoint[] = []
  try {
    if (isZip) {
      const parsed = (await shp(buffer)) as GeoJsonGeometry | GeoJsonGeometry[]
      for (const fc of Array.isArray(parsed) ? parsed : [parsed]) collectGeoJson(fc, out)
    } else {
      // nacktes .shp: keine .prj → Koordinaten werden ungeprüft übernommen und
      // unten gegen WGS84-Grenzen validiert (UTM fällt dabei sauber durch).
      for (const geom of shp.parseShp(buffer) as GeoJsonGeometry[]) collectGeoJson(geom, out)
    }
  } catch {
    throw new Error("Shapefile konnte nicht gelesen werden — ist die Datei vollständig?")
  }
  if (out.length >= 2 && out.filter(isValidPoint).length < 2) {
    throw new Error(
      "Shapefile-Koordinaten liegen nicht in WGS84 — bitte als ZIP inkl. .prj-Datei hochladen.",
    )
  }
  return out
}

/** Parst eine Streckendatei (GPX/KML/GeoJSON/Shapefile) zu einer Punktfolge. */
export async function parseRouteFile(file: File): Promise<ParsedRoute> {
  const name = file.name.toLowerCase()
  let points: RoutePoint[]
  let format: ParsedRoute["format"]
  if (name.endsWith(".gpx")) {
    points = parseGpx(await file.text())
    format = "gpx"
  } else if (name.endsWith(".kml")) {
    points = parseKml(await file.text())
    format = "kml"
  } else if (name.endsWith(".geojson") || name.endsWith(".json")) {
    points = parseGeoJson(await file.text())
    format = "geojson"
  } else if (name.endsWith(".zip") || name.endsWith(".shp")) {
    points = await parseShapefile(file, name.endsWith(".zip"))
    format = "shp"
  } else {
    throw new Error("Unbekanntes Format — bitte GPX, KML, GeoJSON oder Shapefile verwenden.")
  }

  const valid = points.filter(isValidPoint)
  if (valid.length < 2) throw new Error("Die Datei enthält keine gültigen Strecken-Koordinaten.")
  return { points: downsample(valid), format }
}

/** Streckenlänge (km, Haversine) einer Punktfolge — für die Upload-Vorschau. */
export function routeLengthKm(points: RoutePoint[]): number {
  const R = 6371
  let km = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const la1 = (a.lat * Math.PI) / 180
    const la2 = (b.lat * Math.PI) / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2)
    km += 2 * R * Math.asin(Math.sqrt(h))
  }
  return Math.round(km)
}
