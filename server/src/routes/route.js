// Routen-Berechnung: Start/Ziel ODER Google-Maps-Link → optimaler Straßenweg (OSRM).
// Liefert eine Punktfolge (Geometrie) zurück, die das FE wie eine hochgeladene Strecke
// als weitere Route anhängt. Bewusst OHNE LKW-Restriktionen — der optimale Weg; die
// Restriktionen prüft anschließend die Auswertung gegen die Hindernis-DB.

import { Router } from "express"
import { geocodeOrt, resolveRoute, routeWaypoints } from "../engine/resolveRoute.js"
import { extractMapsStops } from "../external/gmaps.js"
import { extractPdfText } from "../external/pdfText.js"
import { parseVemagsText } from "../external/vemags.js"
import { resolveKnoten } from "../external/abKnoten.js"
import { cleanWaypoints } from "../external/vemagsClean.js"
import { ApiError, asyncHandler } from "../util.js"

// VEMAGS (T-567): Wegpunkt-Auflösung. Grundsatz (Max 2026-06-23): KEINEN Bescheid-Wegpunkt
// überspringen — jeder Punkt zwingt die Route auf den vorgeschriebenen Korridor (sonst free-routet
// OSRM und fährt Umwege/zurück). Schlüssel ist daher präzises Geocoding statt Verwerfen:
//  - AB-Knoten (AS/AK/AD): km-genau über den OSM-motorway_junction-Gazetteer.
//  - Start/Ziel: „PLZ Ort" (Landmark in {…} + Adressdetail nach dem Komma weg) — eindeutig.
//  - mehrdeutige Orts-/Straßennamen (z.B. „Borsigstraße" → ohne Kontext Berlin/Hamburg): mit einer
//    ENGEN Viewbox um die direkten, bereits aufgelösten Nachbar-Anker geokodiert → lokaler Treffer.
//  - nicht auflösbar (privates Landmark wie „GüG Eschau"): an den nächsten Anker heften statt grob
//    raten — Punkt bleibt erhalten, ohne falschen Umweg.
const cleanOrt = (s) => String(s ?? "").replace(/\{[^}]*\}/g, "").split(",")[0].trim()

// Start-/Ziel-Adresse moeglichst praezise (PLZ+Ort+Strasse[+Hausnr]). {Facility} + Zuwegungs-Zusatz
// weg, Str.→Strasse. Volladresse zuerst → Strasse-zuerst (Hausnr-Praezision) → PLZ+Ort-Fallback
// (falls die „Strasse" eine Strassennummer wie L98 ist). Portiert aus dem Prototyp.
async function geocodeAddress(addr, geocode) {
  let a = String(addr ?? "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s*-\s*(Zuwegung|Zufahrt|Sonderabfahrt)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.]$/, "")
  if (!a) return null
  a = a.replace(/\bStr\./g, "Straße").replace(/\bstr\./g, "straße")
  let g = await geocode(a)
  if (!g) {
    const m = a.match(/^(\d{5}\s+[^,]+),\s*(.+)$/) // "PLZ Ort, Strasse Nr" → "Strasse Nr, PLZ Ort"
    if (m) g = await geocode(`${m[2]}, ${m[1]}`)
  }
  if (!g) {
    const m = a.match(/^(\d{5})\s+([^,]+)/) // nur PLZ + Ort
    if (m) g = await geocode(`${m[1]} ${m[2]}`)
  }
  return g
}
const stripKnoten = (s) => String(s ?? "").replace(/^(AS|AK|AD|Anschlussstelle|Autobahnkreuz|Autobahndreieck|Kreuz|Dreieck)\s+/i, "")
// Nominatim-viewbox (lon1,lat1,lon2,lat2) um zwei Nachbar-Anker, mit Puffer (Grad).
const neighborViewbox = (a, b, buf = 0.25) =>
  `${Math.min(a.lng, b.lng) - buf},${Math.min(a.lat, b.lat) - buf},${Math.max(a.lng, b.lng) + buf},${Math.max(a.lat, b.lat) + buf}`

// Öffentliches DE-Nominatim (NOMINATIM_URL ist in Prod absichtlich aus, T-338; Bescheid-Namen sind
// Behördenquelle → OSM-OK). Drossel ~1 Req/s (OSM-Policy), Request-Memo gegen Doppel-Lookups,
// persistenter geocode_cache NUR für unbiased (eindeutige) Anfragen — biased/viewbox nie cachen
// (Name allein ist mehrdeutig). Liefert {lat,lng}|null (null → Aufrufer heftet an Nachbar).
function makeVemagsGeocoder(db, fetchImpl) {
  const memo = new Map()
  let lastCall = 0
  return async function geocode(q, viewbox) {
    const norm = String(q ?? "").trim()
    if (!norm) return null
    const key = viewbox ? `${norm.toLowerCase()}|${viewbox}` : norm.toLowerCase()
    if (memo.has(key)) return memo.get(key)
    if (!viewbox) {
      const c = await db.query("SELECT lat, lng FROM geocode_cache WHERE query = $1", [norm.toLowerCase()])
      if (c.rows[0]) {
        const r = { lat: Number(c.rows[0].lat), lng: Number(c.rows[0].lng) }
        memo.set(key, r)
        return r
      }
    }
    const wait = 1100 - (Date.now() - lastCall)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    let hit = null
    try {
      let url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&accept-language=de&q=" +
        encodeURIComponent(norm)
      if (viewbox) url += "&bounded=1&viewbox=" + viewbox
      const res = await fetchImpl(url, {
        headers: { "User-Agent": "roadmap-geocode/1.0 (+https://setreo-cloud.com)", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json()
      const h = Array.isArray(data) ? data[0] : null
      const lat = h ? Number(h.lat) : NaN
      const lng = h ? Number(h.lon) : NaN
      if (Number.isFinite(lat) && Number.isFinite(lng)) hit = { lat, lng, displayName: h.display_name ?? norm }
    } catch {
      hit = null
    }
    if (hit && !viewbox) {
      await db.query(
        `INSERT INTO geocode_cache (query, lat, lng, display_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (query) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           display_name = EXCLUDED.display_name, fetched_at = now()`,
        [norm.toLowerCase(), hit.lat, hit.lng, hit.displayName],
      )
    }
    memo.set(key, hit)
    return hit
  }
}

// Zwei-Pass-Auflösung eines Fahrtwegteils → Punktliste in Reihenfolge (jeder mit c={lat,lng} oder null).
// Pass 1: Anker (Knoten via Gazetteer, Start/Ziel via Nominatim). Pass 2: offene Tokens mit enger
// Viewbox um die nächsten aufgelösten Anker; nicht auflösbare an den Nachbar-Anker heften.
async function resolveVemagsPunkte(punkte, geocode) {
  const pts = punkte.map((p) => ({ raw: p.raw, typ: p.typ, c: null }))
  for (const p of pts) {
    if (p.typ === "junction") {
      const k = resolveKnoten(p.raw)
      if (k && Number.isFinite(k.lat) && Number.isFinite(k.lng)) p.c = { lat: k.lat, lng: k.lng }
    } else if (p.typ === "start" || p.typ === "ziel") {
      const g = await geocodeAddress(p.raw, geocode)
      if (g) p.c = { lat: g.lat, lng: g.lng }
    }
  }
  const isAnchor = (i) => i >= 0 && i < pts.length && pts[i].c != null
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].c) continue
    let lo = i - 1
    while (lo >= 0 && !isAnchor(lo)) lo--
    let hi = i + 1
    while (hi < pts.length && !isAnchor(hi)) hi++
    const a = lo >= 0 ? pts[lo].c : null
    const b = hi < pts.length ? pts[hi].c : null
    const q = pts[i].typ === "junction" ? stripKnoten(pts[i].raw) : cleanOrt(pts[i].raw)
    const g = await geocode(q, a && b ? neighborViewbox(a, b) : null)
    pts[i].c = g ? { lat: g.lat, lng: g.lng } : (a ?? b ?? null) // nicht überspringen: an Nachbar heften
  }
  return pts
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
      waypoints: out.waypoints ?? null, // exakte Start/Ziel/Via-Punkte → statisch mit der Strecke speichern (T-582)
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
    // T-301#1: resolvedUrl NICHT ans FE zurückgeben (kein SSRF-/Redirect-Oracle). Die finale
    // URL ist ohnehin gegen die Google-Allowlist geprüft; das FE braucht sie nicht.
    const { stops } = await extractMapsStops(url, { fetchImpl })
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
      waypoints: out.waypoints ?? null, // gezogene Wegpunkte des Links → statisch mit der Strecke speichern (T-582)
      distanzKm: out.distanzKm,
      dauerMin: out.dauerMin ?? null,
      provider: out.provider,
      stops: stops.length,
    })
  }))

  /** VEMAGS-Bescheid (PDF, base64) → Fahrtweg-Strecken (1 je Fahrtwegteil) + Transport-Maße (T-567).
   *  Der PDF-Buffer wird NUR in-memory geparst und sofort verworfen (Auflage: nie speichern).
   *
   *  ⚠️ DEAKTIVIERT (2026-06-24): Der VEMAGS-Streckenextraktor wird manuell NEU gebaut (Max liefert
   *  das Modul). Bis dahin ist der Endpoint INERT — 404, AUSSER FEATURE_VEMAGS === "on" (Opt-in).
   *  Off-by-default, damit ohne Env nichts läuft. Die Alt-Logik (external/vemags.js, abKnoten.js,
   *  pdfText.js, data/ab_knoten_de.json) bleibt vorerst im Repo, wird aber durch das neue Modul
   *  ERSETZT → hier nichts mehr dranbauen, bis das neue Modul steht (dann FE VEMAGS_AKTIV=true). */
  r.post("/vemags", asyncHandler(async (req, res) => {
    if (process.env.FEATURE_VEMAGS !== "on") throw new ApiError(404, "Nicht gefunden")
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

    const geocode = makeVemagsGeocoder(db, fetchImpl)

    // Je Fahrtwegteil: ALLE Wegpunkte auflösen (kein Überspringen → der vorgeschriebene Korridor
    // zwingt OSRM auf den Weg, kein Free-Routing/Zurückfahren) → OSRM-Route.
    const out = []
    for (const s of strecken) {
      const pts = await resolveVemagsPunkte(s.punkte, geocode)
      // Schlenker/Fehl-Geocodes raus (zum naechsten sicheren Punkt ziehen) — sonst sinnlose Loops.
      const { kept, dropped } = cleanWaypoints(pts)
      const wps = kept.map((p) => ({ lat: p.c.lat, lng: p.c.lng }))
      if (wps.length < 2) {
        out.push({ name: s.name, art: s.art, istLastfahrt: s.istLastfahrt, points: [], distanzKm: 0, fehler: "Zu wenige Wegpunkte aufgelöst." })
        continue
      }
      const route = await routeWaypoints(db, wps, { osrm }, { geocoder: "mixed" })
      out.push({
        name: s.name,
        art: s.art,
        istLastfahrt: s.istLastfahrt,
        points: route.geometry,
        waypoints: route.waypoints ?? wps, // exakte Wegpunkte statisch mit der Strecke speichern (T-582)
        distanzKm: route.distanzKm,
        grob: route.provider.router === "fallback",
        wegpunkte: wps.length,
        bereinigt: dropped.length, // entfernte Schlenker/Fehl-Geocodes (Transparenz)
        verifiziert: false, // VEMAGS-Strecken muessen manuell geprueft & freigegeben werden (Pruefen-Gate)
      })
    }

    res.json({ meta, spec, strecken: out })
  }))

  return r
}
