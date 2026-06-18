// Strecken-Export: aus der Punkt-Geometrie einer Strecke entweder einen Google-Maps-
// Routenlink (neuer Tab) oder eine KML-Datei (Download) erzeugen. Beides wird aus den
// Punkten gebaut — egal ob die Strecke per Datei, Google-Link oder Routing-Engine
// entstand (das jeweils „andere" Format wird also automatisch mitgeliefert).

import type { ProjectRoute, RoutePoint } from "@/types/domain"

const finite = (p: RoutePoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng)

/** Gleichmäßig n Punkte ziehen (inkl. erstem + letztem). */
function sample(points: RoutePoint[], n: number): RoutePoint[] {
  if (points.length <= n) return points
  const step = (points.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => points[Math.round(i * step)])
}

/** Google-Maps-Routenlink (Directions API). Google nimmt nur eine Handvoll Wegpunkte →
 *  Start + bis zu 8 gleichmäßig gesampelte Zwischenpunkte + Ziel. Reihenfolge: lat,lng. */
export function routeToGoogleMapsUrl(route: ProjectRoute): string {
  const pts = route.points.filter(finite)
  if (pts.length < 2) return "https://www.google.com/maps"
  const ll = (p: RoutePoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
  const vias = sample(pts.slice(1, -1), 8).map(ll)
  const u = new URL("https://www.google.com/maps/dir/")
  u.searchParams.set("api", "1")
  u.searchParams.set("origin", ll(pts[0]))
  u.searchParams.set("destination", ll(pts[pts.length - 1]))
  if (vias.length) u.searchParams.set("waypoints", vias.join("|"))
  u.searchParams.set("travelmode", "driving")
  return u.toString()
}

const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** KML-Dokument (LineString) für die Strecke. KML-Reihenfolge: lng,lat,alt. */
export function routeToKml(route: ProjectRoute): string {
  const coords = route.points
    .filter(finite)
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)},0`)
    .join(" ")
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escXml(route.name)}</name>
    <Placemark>
      <name>${escXml(route.name)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`
}

/** Dateiname-sicherer Slug aus dem Streckennamen. */
function slug(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "strecke"
}

/** KML als Datei herunterladen (Browser-Download). */
export function downloadKml(route: ProjectRoute): void {
  const blob = new Blob([routeToKml(route)], { type: "application/vnd.google-earth.kml+xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug(route.name)}.kml`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Google-Maps-Route in neuem Tab öffnen. */
export function openInGoogleMaps(route: ProjectRoute): void {
  window.open(routeToGoogleMapsUrl(route), "_blank", "noopener,noreferrer")
}
