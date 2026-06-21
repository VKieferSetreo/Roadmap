// Geocoding-Endpoint: Cache → Nominatim → eingebaute Städte-Tabelle.

import { Router } from "express"
import { geocodeOrt } from "../engine/resolveRoute.js"
import { ApiError, asyncHandler } from "../util.js"

export function geoRouter({ db, nominatim, fetchImpl = globalThis.fetch }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    if (!q) throw new ApiError(400, "q erforderlich")
    const hit = await geocodeOrt(db, nominatim, q)
    res.json({ lat: hit.lat, lng: hit.lng, displayName: hit.displayName, provider: hit.provider })
  }))

  // Autocomplete-/Karten-Suche: mehrere Treffer. Server-seitig zu Nominatim — der direkte
  // Browser-Fetch ist seit der CSP (connect-src 'self') geblockt, und so leakt auch keine
  // Client-IP an Nominatim. DE-beschränkt, max 6.
  r.get("/search", asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    if (q.length < 3) return res.json({ results: [] })
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=de&accept-language=de&q=" +
      encodeURIComponent(q)
    try {
      const r2 = await fetchImpl(url, {
        headers: { "User-Agent": "roadmap-geocode/1.0 (+https://setreo-cloud.com)", Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      })
      const data = await r2.json()
      const results = Array.isArray(data)
        ? data.map((h) => ({
            place_id: h.place_id,
            display_name: h.display_name,
            lat: h.lat,
            lon: h.lon,
            boundingbox: h.boundingbox, // [south, north, west, east] — für fitBounds (Ortssuche)
          }))
        : []
      res.json({ results })
    } catch {
      res.json({ results: [] })
    }
  }))

  return r
}
