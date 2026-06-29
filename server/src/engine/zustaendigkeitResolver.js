// Zuständigkeits-Resolver (T-614): ordnet einem Fund die zuständige Stelle + erreichbaren Kontakt zu.
// Läuft zur ANZEIGE-Zeit (map.js rowToFinding) → keine DB-Migration, keine Re-Analyse; gilt sofort
// für alle (auch bestehende) Funde, und automatisch für neue.
//
// Drei Tiers (nach Straßenklasse, deterministisch):
//   1) Autobahn (A)  → zuständige GST-Niederlassung der Autobahn GmbH (Kreis→GST-Zuordnung, amtlicher
//      GST-Viewer-Snapshot). Kontakt aus gst_niederlassungen.json (autobahn.de).
//   2) Bundes-/Landesstraße (B/L) → Landesbetrieb Straßenbau des Bundeslandes (Bundesländer-Polygon →
//      Bundesland → zustaendigkeit_laender.json, gescrapt+QC).
//   3) Gemeinde-/sonstige Straße → Tiefbauamt der Stadt, falls der Fund in einer erfassten (meist
//      kreisfreien) Stadt liegt (Kreisname-Match → zustaendigkeit_staedte.json, gescrapt+QC).
// Zuordnung per Point-in-Polygon (Bounding-Box-Vorfilter + Ray-Casting).

import { readFileSync } from "node:fs"

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"))

function toPolygons(geom) {
  if (!geom) return []
  if (geom.type === "Polygon") return [geom.coordinates]
  if (geom.type === "MultiPolygon") return geom.coordinates
  return []
}

// Generischer Polygon-Index mit vorberechneter Bounding-Box.
function buildIndex(geojson, valFn) {
  const items = []
  for (const f of geojson.features || []) {
    const val = valFn(f.properties || {})
    if (val == null) continue
    const polys = toPolygons(f.geometry)
    if (!polys.length) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const poly of polys) {
      for (const ring of poly) {
        for (const pt of ring) {
          if (pt[0] < minX) minX = pt[0]
          if (pt[0] > maxX) maxX = pt[0]
          if (pt[1] < minY) minY = pt[1]
          if (pt[1] > maxY) maxY = pt[1]
        }
      }
    }
    items.push({ val, polys, bbox: [minX, minY, maxX, maxY] })
  }
  return items
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

function lookup(index, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  for (const it of index) {
    const [a, b, c, d] = it.bbox
    if (lng < a || lng > c || lat < b || lat > d) continue
    for (const poly of it.polys) {
      if (pointInPoly(lng, lat, poly)) return it.val
    }
  }
  return null
}

// LAZY-Init: Daten + Indizes erst beim ersten Aufruf laden/bauen (nicht beim Import) → der
// map.js-Import bleibt leicht; das ~2 MB GeoJSON wird nur geladen, wenn der Resolver wirklich genutzt
// wird. Danach gecacht.
let _state = null
function state() {
  if (_state) return _state
  const gstGeo = load("../data/gst_kreis_zuordnung.geojson")
  const blGeo = load("../data/bundeslaender.geojson")
  const nlContacts = load("../data/gst_niederlassungen.json")
  _state = {
    // Kreis-Index (alle 442 Kreise; nlz für Tier 1, Kreisname für Tier 3).
    kreisIndex: buildIndex(gstGeo, (p) => (p.GST_NLZ || p.Kreisname ? { nlz: p.GST_NLZ, kreis: p.Kreisname } : null)),
    // Bundesländer-Index (16) für Tier 2.
    blIndex: buildIndex(blGeo, (p) => p.land || null),
    contactByNlz: new Map(nlContacts.map((c) => [c.gst_nlz, c])),
    laenderKontakt: load("../data/zustaendigkeit_laender.json"),
    staedteKontakt: load("../data/zustaendigkeit_staedte.json"),
  }
  return _state
}

// Kreisname → normalisierter Stadt-Key (für Tier-3-Match gegen zustaendigkeit_staedte.json).
const normCity = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\(kreisfreie stadt\)|\(stadt\)|, stadt|landeshauptstadt|hansestadt|stadt /g, "")
    .replace(/im breisgau|i\. br\.|a\.d\..*$/g, "")
    .replace(/[^a-zäöüß]/g, "")
    .trim()

// Straßenklasse am Ref erkennen.
const AUTOBAHN_RE = /(?:^|[\s(/])A ?\d/ // A7, A 7, "BAB A1", "(A99)"
const BUNDES_LANDES_RE = /(?:^|[\s(/])[BL] ?\d/ // B27, L1100 (nicht "Lange Straße" / "Bahnhofstr.")

function clean(c) {
  // leere Felder weglassen
  const o = { stelle: c.stelle, rolle: c.rolle }
  if (c.email) o.email = c.email
  if (c.telefon) o.telefon = c.telefon
  if (c.adresse) o.adresse = c.adresse
  return o
}

/**
 * Fund → Kontakt der zuständigen Stelle (oder null).
 * @param {{lat:number|string, lng:number|string, strassenRef?:string|null}} f
 */
export function resolveKontakt(f) {
  const lat = Number(f?.lat), lng = Number(f?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const ref = String(f?.strassenRef ?? "")
  // Schnell-Ausstieg ohne Daten-Load, wenn der Ref gar keine relevante Straßenklasse trägt UND
  // wir keinen Stadt-Check brauchen — der Stadt-Check (Tier 3) braucht aber den Kreis-Lookup, also
  // laden wir nur, wenn überhaupt eine Auflösung möglich ist (immer der Fall mit gültiger Koordinate).
  const { kreisIndex, blIndex, contactByNlz, laenderKontakt, staedteKontakt } = state()

  // Tier 1: Autobahn → GST-Niederlassung
  if (AUTOBAHN_RE.test(ref)) {
    const hit = lookup(kreisIndex, lat, lng)
    const c = hit && contactByNlz.get(hit.nlz)
    if (c) {
      return clean({
        stelle: `Autobahn GmbH – ${c.niederlassung}`,
        rolle: "Großraum- & Schwertransport (GST)",
        email: c.email, telefon: c.telefon, adresse: c.adresse,
      })
    }
    return null
  }

  // Tier 2: Bundes-/Landesstraße → Landesbetrieb des Bundeslandes
  if (BUNDES_LANDES_RE.test(ref)) {
    const land = lookup(blIndex, lat, lng)
    const c = land && laenderKontakt[land]
    if (c) return clean(c)
    return null
  }

  // Tier 3: Gemeinde-/sonstige Straße → Tiefbauamt der Stadt (falls erfasst)
  const hit = lookup(kreisIndex, lat, lng)
  const c = hit && staedteKontakt[normCity(hit.kreis)]
  if (c) return clean(c)
  return null
}

// Amtliche Kreis→GST-Zuordnung (nur Attribute, ohne Geometrie) — für den Drift-Check.
const GST_ATTR_URL =
  "https://services-eu1.arcgis.com/46eZsDVh7oveCuwo/arcgis/rest/services/Kreise_GST_Niederlassungszuordnung/FeatureServer/0/query?where=1%3D1&outFields=Kreisname,GST_NLZ&returnGeometry=false&f=json"

/**
 * Cron-Drift-Check (T-614): vergleicht die LIVE Kreis→GST-Zuordnung der Autobahn GmbH mit unserem
 * eingebackenen Snapshot. Meldet geänderte/entfernte Kreise → dann Snapshot neu ziehen + deployen.
 * (Cross-Container-Datei-Writes bringen nichts, daher reiner Monitor: erkennen + loggen.)
 */
export async function checkGstDrift(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(GST_ATTR_URL, { signal: AbortSignal.timeout(20000) })
  const j = await res.json()
  const live = new Map()
  for (const f of j.features || []) live.set(f.attributes?.Kreisname, f.attributes?.GST_NLZ)
  const committed = new Map()
  for (const it of state().kreisIndex) committed.set(it.val.kreis, it.val.nlz)
  const changed = []
  for (const [kreis, nlz] of live) {
    if (committed.get(kreis) !== nlz) changed.push({ kreis, alt: committed.get(kreis) ?? "(neu)", neu: nlz })
  }
  const removed = [...committed.keys()].filter((k) => !live.has(k))
  return { liveCount: live.size, committedCount: committed.size, changed, removed }
}

/** Für Tests/Cron: geladene Datenmengen (löst den Lazy-Load aus). */
export function resolverStatus() {
  const s = state()
  return {
    kreise: s.kreisIndex.length,
    niederlassungen: s.contactByNlz.size,
    bundeslaender: s.blIndex.length,
    laenderKontakte: Object.keys(s.laenderKontakt).length,
    staedteKontakte: Object.keys(s.staedteKontakt).length,
  }
}
