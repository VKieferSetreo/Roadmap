// Routen-Berechnung: Start/Ziel ODER Google-Maps-Link → optimaler Straßenweg (OSRM).
// Liefert eine Punktfolge (Geometrie) zurück, die das FE wie eine hochgeladene Strecke
// als weitere Route anhängt. Bewusst OHNE LKW-Restriktionen — der optimale Weg; die
// Restriktionen prüft anschließend die Auswertung gegen die Hindernis-DB.

import { Router } from "express"
import { geocodeOrt, resolveRoute, routeWaypoints } from "../engine/resolveRoute.js"
import { haversineKm } from "../engine/geometry.js"
import { extractMapsStops } from "../external/gmaps.js"
import { extractPdfText } from "../external/pdfText.js"
import { parseVemagsText } from "../external/vemags.js"
import { resolveKnoten } from "../external/abKnoten.js"
import { ApiError, asyncHandler } from "../util.js"

// VEMAGS (T-567): ein Wegpunkt-Token → {lat,lng}. AB-Knoten zuerst über den Gazetteer (km-genau),
// sonst Präfix strippen + Ortsteil geokodieren. Start/Ziel/Orte: PLZ+Ort (Landmark in {…} und
// Adress-Detail nach dem Komma weglassen — verschlechtern den Geocode). geocodeOrt fällt intern
// notfalls auf die Städte-Tabelle zurück, liefert also immer eine Koordinate (Route bleibt
// zusammenhängend, ggf. gröber).
const cleanOrt = (s) => String(s ?? "").replace(/\{[^}]*\}/g, "").split(",")[0].trim()

// VEMAGS-Geocoder: in Prod ist der reguläre `nominatim` (NOMINATIM_URL) absichtlich aus (T-338,
// Personenbezug bei freien Routen). VEMAGS-Wegpunkte sind aber Straßen-/Ortsnamen aus einem
// amtlichen Bescheid (Behördenquelle → OSM-OK, Max 2026-06-23) und brauchen präzise Koordinaten.
// Daher derselbe öffentliche, DE-beschränkte Nominatim-Pfad wie der /api/geocode/search-Proxy —
// gedrosselt auf ~1 Req/s (OSM-Nutzungsrichtlinie) und über geocodeOrt im geocode_cache gepuffert.
function makePublicGeocoder(fetchImpl) {
  let lastCall = 0
  return {
    async geocode(ort) {
      const wait = 1100 - (Date.now() - lastCall)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastCall = Date.now()
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&accept-language=de&q=" +
          encodeURIComponent(ort)
        const res = await fetchImpl(url, {
          headers: { "User-Agent": "roadmap-geocode/1.0 (+https://setreo-cloud.com)", Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        })
        const data = await res.json()
        const hit = Array.isArray(data) ? data[0] : null
        if (!hit) return null
        const lat = Number(hit.lat)
        const lng = Number(hit.lon)
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, displayName: hit.display_name ?? ort } : null
      } catch {
        return null
      }
    },
  }
}

// Ausreißer-Filter: ein zwischengelagerter Wegpunkt, der einen unplausiblen Umweg erzwingt, ist
// fast immer ein Fehl-Geocode mehrdeutiger Namen (z.B. "Borsigstraße" → Berlin statt Aurich, +1000 km).
// Greedy von Start nach Ziel; verwirft einen Zwischenpunkt, dessen Umweg (geg. der Geraden zwischen
// vorigem behaltenen Punkt und dem nächsten) > maxExtraKm ist. Start/Ziel bleiben unangetastet.
export function dropDetours(pts, maxExtraKm = 120) {
  if (pts.length <= 2) return { kept: pts, dropped: [] }
  const kept = [pts[0]]
  const dropped = []
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = kept[kept.length - 1]
    const cur = pts[i]
    const next = pts[i + 1]
    const extra = haversineKm(prev, cur) + haversineKm(cur, next) - haversineKm(prev, next)
    if (extra > maxExtraKm) dropped.push(cur)
    else kept.push(cur)
  }
  kept.push(pts[pts.length - 1])
  return { kept, dropped }
}

async function resolvePunkt(p, { db, geo }) {
  if (p.typ === "junction") {
    const k = resolveKnoten(p.raw)
    if (k && Number.isFinite(k.lat) && Number.isFinite(k.lng)) return { lat: k.lat, lng: k.lng, quelle: "knoten" }
    const ort = p.raw.replace(/^(AS|AK|AD|Anschlussstelle|Autobahnkreuz|Autobahndreieck|Kreuz|Dreieck)\s+/i, "")
    const g = await geocodeOrt(db, geo, ort)
    return { lat: g.lat, lng: g.lng, quelle: g.provider }
  }
  const g = await geocodeOrt(db, geo, cleanOrt(p.raw))
  return { lat: g.lat, lng: g.lng, quelle: g.provider }
}

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

  /** Wegpunkt-Koordinaten (≥2 {lat,lng}) → gesnappte Strecke. Für den Strecken-Editor:
   *  Punkt ziehen/einfügen/löschen → OSRM rechnet den Straßenweg live neu (Cache via routeKey). */
  r.post("/waypoints", asyncHandler(async (req, res) => {
    const points = Array.isArray(req.body?.points) ? req.body.points : []
    const out = await routeWaypoints(db, points, { osrm }, { geocoder: "manual" })
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

  /** VEMAGS-Bescheid (PDF, base64) → Fahrtweg-Strecken (1 je Fahrtwegteil) + Transport-Maße (T-567).
   *  Der PDF-Buffer wird NUR in-memory geparst und sofort verworfen (Auflage: nie speichern).
   *  Rückbau: FEATURE_VEMAGS=off → 404 (FE blendet den Tab dann ebenfalls aus). */
  r.post("/vemags", asyncHandler(async (req, res) => {
    if (process.env.FEATURE_VEMAGS === "off") throw new ApiError(404, "Nicht gefunden")
    const b64 = typeof req.body?.pdfBase64 === "string" ? req.body.pdfBase64.replace(/^data:[^,]*,/, "") : ""
    if (!b64) throw new ApiError(400, "pdfBase64 erforderlich")
    let buffer = Buffer.from(b64, "base64")
    if (buffer.length < 100 || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      buffer = null
      throw new ApiError(422, "Die hochgeladene Datei ist kein lesbares PDF.")
    }

    let text
    try {
      text = await extractPdfText(buffer)
    } finally {
      buffer = null // PDF sofort verwerfen — kein Disk/DB/Log (sensible Kundendaten).
    }
    const { meta, spec, strecken } = parseVemagsText(text)
    text = null
    if (!strecken.length) {
      throw new ApiError(
        422,
        "Kein Fahrtweg (Punkt 9) im Bescheid erkannt. Ist es ein VEMAGS-Genehmigungsbescheid?",
      )
    }

    // Self-hosted Nominatim bevorzugen (falls je gesetzt), sonst öffentliches DE-Nominatim.
    const geo = nominatim ?? makePublicGeocoder(fetchImpl)

    // Je Fahrtwegteil: Wegpunkte auflösen → OSRM-Route. Geocode-Cache wärmt über die Teile hinweg.
    const out = []
    for (const s of strecken) {
      const cand = []
      const ungeloest = []
      for (const p of s.punkte) {
        const c = await resolvePunkt(p, { db, geo })
        // Nur präzise Punkte (Gazetteer/Nominatim/Cache/Pin). Ein "cities"-Treffer ist nur eine grobe
        // Namensschätzung (Nominatim-Miss) und würde als falscher Wegpunkt einen Umweg erzwingen
        // (z.B. privates Landmark "GüG Eschau") → überspringen (Konzept §4).
        if (c && c.quelle !== "cities" && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
          cand.push({ lat: c.lat, lng: c.lng, raw: p.raw })
        } else ungeloest.push(p.raw)
      }
      // Fehl-Geocodes mehrdeutiger Namen (Umweg-Ausreißer) verwerfen — Route bleibt zusammenhängend.
      const { kept, dropped } = dropDetours(cand)
      for (const d of dropped) ungeloest.push(d.raw)
      const wps = kept.map((k) => ({ lat: k.lat, lng: k.lng }))
      if (wps.length < 2) {
        out.push({ name: s.name, art: s.art, istLastfahrt: s.istLastfahrt, points: [], distanzKm: 0, fehler: "Zu wenige Wegpunkte aufgelöst.", ungeloest })
        continue
      }
      const route = await routeWaypoints(db, wps, { osrm }, { geocoder: "mixed" })
      out.push({
        name: s.name,
        art: s.art,
        istLastfahrt: s.istLastfahrt,
        points: route.geometry,
        distanzKm: route.distanzKm,
        grob: route.provider.router === "fallback",
        wegpunkte: wps.length,
        ungeloest,
      })
    }

    res.json({ meta, spec, strecken: out })
  }))

  return r
}
