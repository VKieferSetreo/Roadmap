// Routen-Auflösung: RouteInput → Geometrie + Distanz.
// Kaskade pro Stufe: DB-Cache → externer Provider → deterministischer Fallback.

import { createHash } from "node:crypto"
import { resolveOrt } from "./cities.js"
import { buildPolyline, downsample, seedWaypoints } from "./fallback.js"
import { totalKm } from "./geometry.js"
import { ApiError, isFiniteNumber } from "../util.js"

/** Geocoding eines Ortsnamens: geocode_cache → Nominatim → Städte-Tabelle. */
export async function geocodeOrt(db, nominatim, ort) {
  const key = String(ort).trim().toLowerCase()
  const cached = await db.query(
    "SELECT lat, lng, display_name FROM geocode_cache WHERE query = $1",
    [key],
  )
  if (cached.rows[0]) {
    const row = cached.rows[0]
    return { lat: row.lat, lng: row.lng, displayName: row.display_name ?? ort, provider: "cache" }
  }
  const hit = nominatim ? await nominatim.geocode(ort) : null
  if (hit) {
    await db.query(
      `INSERT INTO geocode_cache (query, lat, lng, display_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (query) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         display_name = EXCLUDED.display_name, fetched_at = now()`,
      [key, hit.lat, hit.lng, hit.displayName],
    )
    return { ...hit, provider: "nominatim" }
  }
  const p = resolveOrt(ort)
  return { lat: p.lat, lng: p.lng, displayName: ort, provider: "cities" }
}

/** Stabiler Cache-Key über die (gerundete) Waypoint-Liste. */
export function routeKey(waypoints) {
  const norm = waypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";")
  return createHash("sha1").update(norm).digest("hex")
}

const summarizeProviders = (list) => {
  const uniq = [...new Set(list)]
  return uniq.length === 1 ? uniq[0] : "mixed"
}

const sanePoint = (p) => p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

/**
 * @returns {{geometry:{lat,lng}[], distanzKm:number, dauerMin?:number,
 *            provider:{geocoder?:string, router:string, fallback:boolean}}}
 */
export async function resolveRoute(db, route, { nominatim, osrm } = {}) {
  if (route?.mode === "upload") {
    const points = Array.isArray(route.points) ? route.points.filter(sanePoint) : []
    if (points.length >= 2) {
      const geometry = downsample(points.map((p) => ({ lat: p.lat, lng: p.lng })))
      return {
        geometry,
        distanzKm: totalKm(geometry),
        provider: { router: "upload", fallback: false },
      }
    }
    // Upload ohne Punkte → deterministischer Korridor aus dem Dateinamen-Seed
    const geometry = buildPolyline(seedWaypoints(route.fileName ?? "strecke"))
    return {
      geometry,
      distanzKm: totalKm(geometry),
      provider: { router: "fallback", fallback: true },
    }
  }

  // mode=startziel: Ortsnamen geocoden → Wegpunkte → routen
  const orte = [route?.start, ...(route?.vias ?? []), route?.ziel]
    .filter((s) => typeof s === "string" && s.trim())
  if (orte.length < 2) throw new ApiError(400, "Start und Ziel erforderlich")

  const geocoded = []
  for (const ort of orte) geocoded.push(await geocodeOrt(db, nominatim, ort))
  const waypoints = geocoded.map((g) => ({ lat: g.lat, lng: g.lng }))
  return routeWaypoints(db, waypoints, { osrm }, {
    geocoder: summarizeProviders(geocoded.map((g) => g.provider)),
    geocoderFallback: geocoded.some((g) => g.provider === "cities"),
  })
}

/**
 * Routet eine bereits aufgelöste Wegpunkt-Liste (lat/lng) über den optimalen Straßenweg:
 * route_cache → OSRM → deterministischer Geometrie-Fallback. Genutzt von Start/Ziel
 * (nach Geocoding) UND von aus Links extrahierten Wegpunkten (Google-Maps).
 */
export async function routeWaypoints(db, waypoints, { osrm } = {}, meta = {}) {
  const wp = (Array.isArray(waypoints) ? waypoints : []).filter(sanePoint)
  if (wp.length < 2) throw new ApiError(400, "Mindestens zwei Wegpunkte erforderlich")
  const geocoder = meta.geocoder
  const geocoderFallback = meta.geocoderFallback ?? false

  const key = routeKey(wp)
  const cached = await db.query(
    "SELECT geometry, distanz_km, dauer_min FROM route_cache WHERE key = $1",
    [key],
  )
  if (cached.rows[0]) {
    const row = cached.rows[0]
    return {
      geometry: row.geometry,
      distanzKm: Number(row.distanz_km),
      ...(row.dauer_min != null && { dauerMin: Number(row.dauer_min) }),
      provider: { geocoder, router: "cache", fallback: geocoderFallback },
    }
  }

  const osrmRes = osrm ? await osrm.route(wp) : null
  if (osrmRes) {
    const geometry = downsample(osrmRes.geometry)
    await db.query(
      `INSERT INTO route_cache (key, geometry, distanz_km, dauer_min, provider) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET geometry = EXCLUDED.geometry, distanz_km = EXCLUDED.distanz_km,
         dauer_min = EXCLUDED.dauer_min, provider = EXCLUDED.provider, fetched_at = now()`,
      [key, JSON.stringify(geometry), osrmRes.distanzKm, osrmRes.dauerMin, "osrm"],
    )
    return {
      geometry,
      distanzKm: osrmRes.distanzKm,
      dauerMin: osrmRes.dauerMin,
      provider: { geocoder, router: "osrm", fallback: geocoderFallback },
    }
  }

  // OSRM nicht erreichbar → deterministischer Geometrie-Fallback
  const geometry = buildPolyline(wp)
  return {
    geometry,
    distanzKm: totalKm(geometry),
    provider: { geocoder, router: "fallback", fallback: true },
  }
}
