// Geocoding-Endpoint: Cache → Nominatim → eingebaute Städte-Tabelle.

import { Router } from "express"
import { geocodeOrt } from "../engine/resolveRoute.js"
import { ApiError, asyncHandler } from "../util.js"

export function geoRouter({ db, nominatim }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    if (!q) throw new ApiError(400, "q erforderlich")
    const hit = await geocodeOrt(db, nominatim, q)
    res.json({ lat: hit.lat, lng: hit.lng, displayName: hit.displayName, provider: hit.provider })
  }))

  return r
}
