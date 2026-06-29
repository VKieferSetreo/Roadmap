// Zuständigkeits-Resolver (T-614): ordnet einem Fund die zuständige Stelle + erreichbaren Kontakt zu.
// Läuft zur ANZEIGE-Zeit (map.js rowToFinding) → keine DB-Migration, keine Re-Analyse; gilt sofort
// für alle (auch bestehende) Funde, und automatisch für neue.
//
// Stufe 1 (live): AUTOBAHN-Funde → zuständige GST-Niederlassung der Autobahn GmbH. Die amtliche
// Kreis→GST-Zuordnung stammt aus dem GST-Viewer der Autobahn GmbH (offener ArcGIS-Layer, als
// vereinfachter GeoJSON-Snapshot eingebacken); Kontakt aus gst_niederlassungen.json (gescrapt von
// autobahn.de). Zuordnung per Point-in-Polygon (Bounding-Box-Vorfilter + Ray-Casting).
// Spätere Stufen (B/L-Landesbetriebe, Kommunen) hängen sich hier an.

import { readFileSync } from "node:fs"

const kreisGeo = JSON.parse(
  readFileSync(new URL("../data/gst_kreis_zuordnung.geojson", import.meta.url), "utf8"),
)
const nlContacts = JSON.parse(
  readFileSync(new URL("../data/gst_niederlassungen.json", import.meta.url), "utf8"),
)

// GST_NLZ ("NL Rheinland") → Kontaktzeile
const contactByNlz = new Map(nlContacts.map((c) => [c.gst_nlz, c]))

function toPolygons(geom) {
  if (!geom) return []
  if (geom.type === "Polygon") return [geom.coordinates]
  if (geom.type === "MultiPolygon") return geom.coordinates
  return []
}

// Kreis-Polygone mit vorberechneter Bounding-Box (schnelles Vorfiltern vor dem Ray-Casting).
const kreise = []
for (const f of kreisGeo.features || []) {
  const nlz = f.properties?.GST_NLZ
  if (!nlz || !contactByNlz.has(nlz)) continue // "keine Zuständigkeit Autobahn" u.a. fallen hier raus
  const polys = toPolygons(f.geometry)
  if (!polys.length) continue
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of polys) {
    for (const ring of poly) {
      for (const pt of ring) {
        const x = pt[0], y = pt[1]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  kreise.push({ nlz, polys, bbox: [minX, minY, maxX, maxY] })
}

// Ray-Casting (even-odd) gegen alle Ringe EINES Polygons. Koordinaten sind [lng,lat].
function pointInPoly(lng, lat, poly) {
  let inside = false
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1]
      const xj = ring[j][0], yj = ring[j][1]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

function gstNlzFor(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  for (const k of kreise) {
    const [minX, minY, maxX, maxY] = k.bbox
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
    for (const poly of k.polys) {
      if (pointInPoly(lng, lat, poly)) return k.nlz
    }
  }
  return null
}

// Autobahn-Bezug am Straßenref erkennen (A7, A 7, "BAB A1", "(A99)") — ohne B96A o.ä. falsch zu treffen.
const AUTOBAHN_RE = /(?:^|[\s(/])A ?\d/

/**
 * Fund → Kontakt der zuständigen Stelle (oder null).
 * @param {{lat:number|string, lng:number|string, strassenRef?:string|null}} f
 * @returns {{stelle:string, rolle:string, email?:string, telefon?:string, adresse?:string}|null}
 */
export function resolveKontakt(f) {
  const ref = f?.strassenRef
  if (!ref || !AUTOBAHN_RE.test(String(ref))) return null
  const nlz = gstNlzFor(Number(f.lat), Number(f.lng))
  if (!nlz) return null
  const c = contactByNlz.get(nlz)
  if (!c) return null
  return {
    stelle: `Autobahn GmbH – ${c.niederlassung}`,
    rolle: "Großraum- & Schwertransport (GST)",
    ...(c.email && { email: c.email }),
    ...(c.telefon && { telefon: c.telefon }),
    ...(c.adresse && { adresse: c.adresse }),
  }
}

/** Für Tests/Cron: Anzahl geladener Kreis-Polygone. */
export function resolverStatus() {
  return { kreise: kreise.length, niederlassungen: contactByNlz.size }
}
