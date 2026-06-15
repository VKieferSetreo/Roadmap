// Routen-Berechnung: Start/Ziel ODER Google-Maps-Link → optimaler Straßenweg (OSRM).
// Liefert eine Punktfolge (Geometrie) zurück, die das FE wie eine hochgeladene Strecke
// als weitere Route anhängt. Bewusst OHNE LKW-Restriktionen — der optimale Weg; die
// Restriktionen prüft anschließend die Auswertung gegen die Hindernis-DB.

import { Router } from "express"
import { geocodeOrt, resolveRoute, routeWaypoints } from "../engine/resolveRoute.js"
import { extractMapsStops } from "../external/gmaps.js"
import { ApiError, asyncHandler } from "../util.js"

export function routeRouter({ db, nominatim, osrm, fetchImpl = globalThis.fetch }) {
  const r = Router()

  /** Start + Ziel (+ optionale Zwischenstopps als string[]) → Strecke. */
  r.post("/startziel", asyncHandler(async (req, res) => {
    const start = typeof req.body?.start === "string" ? req.body.start.trim() : ""
    const ziel = typeof req.body?.ziel === "string" ? req.body.ziel.trim() : ""
    if (!start || !ziel) throw new ApiError(400, "Start und Ziel erforderlich")
    const vias = Array.isArray(req.body?.vias)
      ? req.body.vias.filter((v) => typeof v === "string" && v.trim())
      : []
    const out = await resolveRoute(db, { mode: "startziel", start, ziel, vias }, { nominatim, osrm })
    res.json({
      points: out.geometry,
      distanzKm: out.distanzKm,
      dauerMin: out.dauerMin ?? null,
      provider: out.provider,
    })
  }))

  /** Google-Maps-Link → Wegpunkte (server-seitig aufgelöst) → Strecke. */
  r.post("/maps", asyncHandler(async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : ""
    if (!url) throw new ApiError(400, "url erforderlich")
    const { stops, resolvedUrl } = await extractMapsStops(url, { fetchImpl })
    if (stops.length < 2) {
      throw new ApiError(
        422,
        "Im Google-Maps-Link wurden keine zwei Wegpunkte erkannt — bitte einen Routen-Link (Wegbeschreibung mit Start und Ziel) verwenden.",
      )
    }
    const waypoints = []
    const provs = []
    for (const s of stops) {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        waypoints.push({ lat: s.lat, lng: s.lng })
        provs.push("link")
      } else if (s.name) {
        const g = await geocodeOrt(db, nominatim, s.name)
        waypoints.push({ lat: g.lat, lng: g.lng })
        provs.push(g.provider)
      }
    }
    const out = await routeWaypoints(db, waypoints, { osrm }, {
      geocoder: provs.includes("nominatim") ? "nominatim" : provs.every((p) => p === "link") ? "link" : "mixed",
      geocoderFallback: provs.includes("cities"),
    })
    res.json({
      points: out.geometry,
      distanzKm: out.distanzKm,
      dauerMin: out.dauerMin ?? null,
      provider: out.provider,
      stops: stops.length,
      resolvedUrl,
    })
  }))

  return r
}
