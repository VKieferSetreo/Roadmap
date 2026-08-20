// Routen-Berechnung: Start/Ziel ODER Google-Maps-Link → optimaler Straßenweg (OSRM).
// Liefert eine Punktfolge (Geometrie) zurück, die das FE wie eine hochgeladene Strecke
// als weitere Route anhängt. Bewusst OHNE LKW-Restriktionen — der optimale Weg; die
// Restriktionen prüft anschließend die Auswertung gegen die Hindernis-DB.

import { Router } from "express"
import { analyze } from "../engine/index.js"
import { cumulativeKm, haversineKm } from "../engine/geometry.js"
import { geocodeOrt, resolveRoute, routeWaypoints } from "../engine/resolveRoute.js"
import { extractMapsStops } from "../external/gmaps.js"
import { extractPdfText } from "../external/pdfText.js"
import { parseVemagsText } from "../external/vemags.js"
import { alleKnoten, resolveKnoten } from "../external/abKnoten.js"
import { ladeBlocker, mitRoutenCache, sucheStrecke } from "../engine/streckensuche.js"
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

// ── Sperrzonen-Umfahrung (KI-Strecken-Wizard, Max 2026-07-15) ────────────────────
// OSRM kann Segmente nicht per Request sperren. Emulation: verletzt die Route eine
// Sperrzone (Kreis um z.B. eine Vollsperrung), konstruieren wir seitlich versetzte
// Umgehungs-Pins und lassen OSRM neu routen — iterativ, beide Seiten, wachsender
// Abstand. Die ENGINE findet den Alternativweg, nicht das Sprachmodell.

/** Erste Zone, die die Geometrie verletzt → {zone, idx des naechsten Punkts} | null. */
/**
 * Ist die Verortung nur grob? Dann liegt die Route nicht auf der Strasse: OSRM ist
 * ausgefallen oder der Ort wurde nur ueber die Staedteliste getroffen.
 *
 * EINE Definition fuer alle Einstiegspunkte. /startziel prueft das seit dem
 * Phantomrouten-Gate; als die Suche dazukam, fehlte die Pruefung dort — und lieferte
 * fuer "Achern → Offenburg" eine 372-km-Strecke ueber Chemnitz, sauber bewertet.
 */
export function istGrobeVerortung(provider) {
  return provider?.router === "fallback" || provider?.geocoder === "cities" || Boolean(provider?.fallback)
}

export function ersteVerletzung(geometry, zonen) {
  for (const zone of zonen) {
    let bestD = Infinity
    let bestI = -1
    for (let i = 0; i < geometry.length; i++) {
      const d = haversineKm(geometry[i], zone)
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    if (bestD < zone.radiusKm) return { zone, idx: bestI }
  }
  return null
}

/** Punkt seitlich der Route (senkrecht zur lokalen Richtung) im Abstand km. */
export function seitlicherPunkt(geometry, idx, km, seite) {
  const p = geometry[idx]
  const a = geometry[Math.max(0, idx - 3)]
  const b = geometry[Math.min(geometry.length - 1, idx + 3)]
  const cosLat = Math.cos((p.lat * Math.PI) / 180)
  let dx = (b.lng - a.lng) * cosLat
  let dy = b.lat - a.lat
  const len = Math.hypot(dx, dy) || 1
  // Normale (senkrecht), seite = +1|-1
  const nx = (-dy / len) * seite
  const ny = (dx / len) * seite
  const gradKm = km / 111.32
  return { lat: p.lat + ny * gradKm, lng: p.lng + (nx * gradKm) / cosLat }
}

/** Umgehungs-Pin an der richtigen Stelle der Pin-Folge einsortieren (nach dem letzten
 *  Pin, der auf der Geometrie VOR der Verletzung liegt). */
export function fuegeViaEin(pins, geometry, verletzungsIdx, via) {
  const idxAufGeom = (pin) => {
    let best = Infinity
    let bi = 0
    for (let i = 0; i < geometry.length; i++) {
      const d = haversineKm(geometry[i], pin)
      if (d < best) {
        best = d
        bi = i
      }
    }
    return bi
  }
  let pos = pins.length - 1
  for (let k = pins.length - 1; k >= 1; k--) {
    if (idxAufGeom(pins[k - 1]) <= verletzungsIdx) {
      pos = k
      break
    }
  }
  const neu = [...pins]
  neu.splice(pos, 0, via)
  return neu
}

/** Route iterativ um die Sperrzonen fuehren. Liefert {out, status[]}. */
export async function umfahreZonen(db, basisOut, zonen, { osrm }) {
  let out = basisOut
  let pins = Array.isArray(out.waypoints) ? [...out.waypoints] : null
  if (!pins || pins.length < 2 || !osrm) {
    return { out, status: zonen.map((z) => ({ ...z, umfahren: false, grund: "Routing ohne Wegpunkte/OSRM" })) }
  }
  const status = new Map(zonen.map((z) => [z, { ...z, umfahren: true }]))
  // Zonen, die Start/Ziel (er sten/letzten Pin) einschliessen oder fast beruehren, sind
  // strukturell NICHT umfahrbar (die Route MUSS dorthin) — gar nicht erst versuchen,
  // sonst biegt die Eskalation die Route ab oder laeuft ins Leere (Max 2026-07-15).
  const start = pins[0]
  const ziel = pins[pins.length - 1]
  const unumfahrbar = zonen.filter((z) => haversineKm(z, start) < z.radiusKm + 1 || haversineKm(z, ziel) < z.radiusKm + 1)
  for (const z of unumfahrbar) {
    const s = status.get(z)
    s.umfahren = false
    s.grund = "Zone liegt am Start/Ziel — die Route muss dorthin, nicht umfahrbar"
  }
  const aktiveZonen = zonen.filter((z) => !unumfahrbar.includes(z))
  if (!aktiveZonen.length) return { out, status: [...status.values()] }
  for (let iter = 0; iter < 10; iter++) {
    const v = ersteVerletzung(out.geometry, aktiveZonen)
    if (!v) break
    // Kandidaten: beide Seiten, wachsender Abstand je Fehlversuch dieser Zone.
    const zoneState = status.get(v.zone)
    zoneState.versuche = (zoneState.versuche ?? 0) + 1
    if (zoneState.versuche > 3) {
      zoneState.umfahren = false
      zoneState.grund = "Keine Umfahrung gefunden (3 Anlaeufe)"
      break
    }
    const abstand = v.zone.radiusKm * (1.6 + 0.8 * (zoneState.versuche - 1))
    let beste = null
    for (const seite of [1, -1]) {
      const via = seitlicherPunkt(out.geometry, v.idx, abstand, seite)
      const testPins = fuegeViaEin(pins, out.geometry, v.idx, via)
      try {
        const testOut = await routeWaypoints(db, testPins, { osrm }, { geocoder: out.provider?.geocoder })
        if (testOut.provider.router === "fallback") continue
        const nochVerletzt = ersteVerletzung(testOut.geometry, [v.zone])
        // Kandidaten, deren Umweg selbst Schleifen/Stichfahrten erzeugt (Via-Pin auf
        // Stichstrasse → rein-raus), sind Murks und fliegen raus (Max 2026-07-15) —
        // lieber die andere Seite / groesserer Abstand als eine zerrissene Route.
        if (!nochVerletzt && !schleifenCheck(testOut.geometry).length && (!beste || testOut.distanzKm < beste.out.distanzKm)) {
          beste = { out: testOut, pins: testPins }
        }
      } catch {
        /* Kandidat unroutbar — andere Seite/Iteration */
      }
    }
    if (beste) {
      out = beste.out
      pins = beste.pins
    }
    // Kein Kandidat: naechste Iteration versucht groesseren Abstand (versuche zaehlt hoch).
  }
  // Schlusspruefung JEDER Zone einzeln: ersteVerletzung meldet nur die erste
  // Treffer-Zone. Mit einer Sammelabfrage blieb jede weitere durchfahrene Zone auf
  // dem anfangs optimistischen umfahren:true stehen — der Agent haette eine nie
  // umfahrene Sperrung als erledigt gemeldet (gefunden 09.08.2026).
  for (const z of aktiveZonen) {
    if (!ersteVerletzung(out.geometry, [z])) continue
    const s = status.get(z)
    s.umfahren = false
    s.grund = s.grund ?? "Route verlaeuft weiterhin durch die Zone"
  }
  return { out, status: [...status.values()].map(({ versuche: _v, ...s }) => s) }
}

/** Schleifen-/Stichfahrt-Check: laeuft die Route laengere Zeit dicht an sich selbst
 *  vorbei (Doppel-Befahrung, Via-Stichfahrt = "Murks-Route", Max 2026-07-15)?
 *  Einzelne Kreuzungen (Bruecke, Kleeblatt) zaehlen NICHT — erst >= 3 aufeinander-
 *  folgende nahe Sample-Paare gelten als Schleife. Endbereiche (2 km um Start/Ziel)
 *  sind ausgenommen, dort ist Out-and-back oft legitime Zufahrt.
 *  ponytail: O(n^2) auf max ~400 Samples — reicht fuer Ad-hoc-Planungsrouten. */
export function schleifenCheck(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) return []
  const cum = cumulativeKm(geometry)
  const totalKm = cum[cum.length - 1]
  if (!Number.isFinite(totalKm) || totalKm < 6) return []
  // Fein sampeln: bei 400 Samples auf 500 km (Step 1,25 km) fiel eine 1-2-km-Stichfahrt
  // KOMPLETT zwischen zwei Samples (Max 2026-07-15: "macht immer noch Loops").
  const step = Math.max(0.15, totalKm / 1500)
  const minGap = Math.max(1.0, 4 * step)
  const samples = []
  let next = 0
  for (let i = 0; i < geometry.length; i++) {
    if (cum[i] >= next) {
      samples.push({ p: geometry[i], km: cum[i] })
      next = cum[i] + step
    }
  }
  const nah = new Array(samples.length).fill(false)
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].km < 2) continue
    if (totalKm - samples[i].km < 2) break
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[j].km - samples[i].km < minGap) continue
      if (totalKm - samples[j].km < 2) break
      if (haversineKm(samples[i].p, samples[j].p) < 0.12) {
        nah[i] = true
        nah[j] = true
      }
    }
  }
  const zonen = []
  let start = -1
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length && nah[i]) {
      if (start < 0) start = i
      continue
    }
    if (start >= 0 && i - start >= 3) {
      zonen.push({
        vonKm: Math.round(samples[start].km * 10) / 10,
        bisKm: Math.round(samples[i - 1].km * 10) / 10,
      })
    }
    start = -1
  }
  return zonen
}

/** Routen-Qualitaet fuer den Planungs-Agenten: Schleifenverdacht + Umwegfaktor
 *  (Strecke / Luftlinie). Der Agent darf Murks-Routen nicht praesentieren. */
export function routenQualitaet(geometry, distanzKm) {
  const schleifen = schleifenCheck(geometry)
  let umwegFaktor = null
  if (Array.isArray(geometry) && geometry.length >= 2 && Number.isFinite(distanzKm)) {
    const luft = haversineKm(geometry[0], geometry[geometry.length - 1])
    if (luft > 1) umwegFaktor = Math.round((distanzKm / luft) * 100) / 100
  }
  return { schleifen, umwegFaktor }
}

/** meide-Body-Param parsen: [{lat, lng, radiusKm?}], max 8 Zonen, Radius 0.5-8 km
 *  (harter Deckel — Riesenzonen zerlegen die Route statt sie zu verbessern). */
export function parseMeide(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 8)
    .map((z) => ({
      lat: zahl(z?.lat),
      lng: zahl(z?.lng),
      radiusKm: Math.min(Math.max(Number(z?.radiusKm) || 3, 0.5), 8),
    }))
    .filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng))
}

/** Koordinate aus dem Request-Body. Nicht Number() direkt: Number(null) und
 *  Number("") sind 0, eine Zone mit fehlendem Feld laege damit stumm im Atlantik
 *  statt verworfen zu werden — und der Agent bekaeme "umfahren" fuer eine Sperrung,
 *  die nie geprueft wurde. Gefunden 09.08.2026 beim Nachziehen der Tests. */
function zahl(v) {
  if (typeof v === "number") return v
  if (typeof v === "string" && v.trim() !== "") return Number(v)
  return NaN
}

export function routeRouter({ db, nominatim, osrm, fetchImpl = globalThis.fetch, corridorM = 20 }) {
  const r = Router()

  /** Ad-hoc-Analyse einer GEPLANTEN Strecke (ohne Projekt, ohne Persistenz) — fuer den
   *  KI-Strecken-Wizard (Setreo-AI): Punkte + optionale Transport-Masse → Funde im Korridor.
   *  Nutzt dieselbe Engine wie die Projekt-Analyse (analyze, nicht runAnalysis). */
  r.post("/analyze", asyncHandler(async (req, res) => {
    const points = Array.isArray(req.body?.points) ? req.body.points : []
    if (points.length < 2) throw new ApiError(400, "points (>= 2 {lat,lng}) erforderlich")
    const t = req.body?.transport ?? {}
    const transport = {
      laenge: Number(t.laenge) || 24.5,
      breite: Number(t.breite) || 3.0,
      hoehe: Number(t.hoehe) || 4.2,
      gesamtgewicht: Number(t.gesamtgewicht) || 68,
    }
    const project = {
      id: null,
      routes: [{ id: "adhoc", name: "Geplante Strecke", points, waypoints: Array.isArray(req.body?.waypoints) ? req.body.waypoints : undefined, source: "startziel" }],
      transport,
    }
    const out = await analyze({ db, project, corridorM, osrm })
    // ALLE kritischen Funde (Cap 150 defensiv) + Warnungen gleichmaessig ueber die Route
    // verteilt — ein km-sortierter Kopf-Slice zeigte nur den Routen-Anfang (Max 2026-07-15).
    const kritische = out.findings.filter((f) => f.severity === "kritisch").slice(0, 150)
    const andere = out.findings.filter((f) => f.severity !== "kritisch")
    const budget = Math.max(0, 160 - kritische.length)
    const step = Math.max(1, Math.ceil(andere.length / budget))
    const verteilt = andere.filter((_, i) => i % step === 0).slice(0, budget)
    res.json({
      distanzKm: out.distanzKm,
      fahrzeitMin: out.fahrzeitMin,
      stats: out.stats,
      findings: [...kritische, ...verteilt].map((f) => ({
        titel: f.titel ?? null,
        kategorie: f.kategorie ?? null,
        severity: f.severity ?? null,
        strassenRef: f.strassenRef ?? null,
        km: typeof f.km === "number" ? Math.round(f.km * 10) / 10 : null,
        lat: f.lat ?? null,
        lng: f.lng ?? null,
        gueltigVon: f.gueltigVon ?? null,
        gueltigBis: f.gueltigBis ?? null,
        // T-042: reicht der Schweregrad nicht — der Aufrufer muss wissen, ob die
        // Stelle mit Auflagen fahrbar ist, ein Verfahren braucht oder ausgeschlossen ist.
        auflagenLage: f.auflagenLage ?? null,
      })),
    })
  }))

  /**
   * STRECKENSUCHE (T-032ff): den Korridor durchsuchen statt eine Route planen.
   *
   * Unterschied zu /startziel: dort kommt EIN Weg zurueck, den der Aufrufer dann mit
   * Sperrzonen nachbessern muss. Hier laeuft die Suche selbst — Blocker-Karte laden,
   * OSRM-Alternativen bewerten, ueber Autobahnknoten ausweichen, von beiden Seiten
   * aufeinander zu — und liefert die beste Strecke SAMT Protokoll, wie sie zustande kam.
   *
   * Das Protokoll ist kein Beiwerk: es ist der Nachweis, welche Alternativen geprueft
   * und warum sie verworfen wurden. Genau das braucht ein Genehmigungsantrag.
   */
  r.post("/suche", asyncHandler(async (req, res) => {
    const start = typeof req.body?.start === "string" ? req.body.start.trim() : ""
    const ziel = typeof req.body?.ziel === "string" ? req.body.ziel.trim() : ""
    if (!start || !ziel) throw new ApiError(400, "Start und Ziel erforderlich")
    if (!osrm) throw new ApiError(503, "Router nicht verfuegbar — ohne OSRM keine Suche")

    const t = req.body?.transport ?? {}
    const transport = {
      laenge: Number(t.laenge) || 24.5,
      breite: Number(t.breite) || 3.0,
      hoehe: Number(t.hoehe) || 4.2,
      gesamtgewicht: Number(t.gesamtgewicht) || 68,
    }
    const zeitraum = {
      von: typeof req.body?.zeitraum?.von === "string" ? req.body.zeitraum.von.slice(0, 10) : null,
      bis: typeof req.body?.zeitraum?.bis === "string" ? req.body.zeitraum.bis.slice(0, 10) : null,
    }

    // Start/Ziel aufloesen wie bei /startziel — dieselbe Geocoder-Kette, damit eine
    // Suche nicht anders verortet als eine Planung.
    const basis = await resolveRoute(db, { mode: "startziel", start, ziel, vias: [] }, { nominatim, osrm })
    // EHRLICHKEITS-GATE, dasselbe wie in /startziel: Faellt der Geocoder auf die
    // Staedteliste zurueck oder OSRM aus, liegen Start/Ziel irgendwo — und die Suche
    // wuerde einen fremden Korridor durchkaemmen und ihn als Ergebnis ausgeben.
    // Beim Messlauf 19.08. kam fuer "Achern → Offenburg" (30 km in Baden) eine Strecke
    // ueber Grosskugel und Chemnitz-Gloesa heraus, 372 km, mit "0 kritisch" bewertet.
    // Ein falscher Korridor mit sauberem Urteil ist schlimmer als kein Ergebnis.
    if (istGrobeVerortung(basis.provider)) {
      throw new ApiError(
        422,
        `Start oder Ziel konnte nicht genau verortet werden (geocoder=${basis.provider?.geocoder ?? "?"}, router=${basis.provider?.router ?? "?"}) — ` +
          "ohne belastbare Endpunkte wird nicht gesucht. Genauere Adresse oder Koordinaten 'lat,lng' angeben.",
      )
    }
    const pins = Array.isArray(basis.waypoints) && basis.waypoints.length >= 2 ? basis.waypoints : null
    if (!pins) throw new ApiError(422, "Start oder Ziel konnte nicht aufgeloest werden")
    const von = pins[0]
    const nach = pins[pins.length - 1]

    const blocker = await ladeBlocker(db, { start: von, ziel: nach, transport, zeitraum, tenantId: req.ctx?.tenantId ?? null })
    const ergebnis = await sucheStrecke(von, nach, {
      blocker,
      knoten: alleKnoten(),
      route: mitRoutenCache((a, b, opt) => osrm.routeAlternativen(a, b, opt)),
      korridorKm: Math.min(Math.max(Number(req.body?.korridorKm) || 60, 10), 200),
      maxKanten: Math.min(Math.max(Number(req.body?.maxKanten) || 40, 3), 120),
      maxMs: Math.min(Math.max(Number(req.body?.maxMs) || 90_000, 5_000), 240_000),
      breite: Math.min(Math.max(Number(req.body?.breite) || 4, 1), 12),
    })

    res.json({
      gefunden: ergebnis.gefunden === true,
      grund: ergebnis.grund ?? null,
      blockerImKorridor: blocker.length,
      strecke: ergebnis.beste
        ? {
            points: ergebnis.beste.geometrie,
            distanzKm: Math.round(ergebnis.beste.distanzKm * 10) / 10,
            ueber: ergebnis.beste.ueber,
            offeneBlocker: ergebnis.beste.blocker.map((b) => ({
              titel: b.titel, kategorie: b.kategorie, strassenRef: b.strassenRef, lat: b.lat, lng: b.lng,
              km: b.km ?? null, gueltigVon: b.gueltigVon ?? null, gueltigBis: b.gueltigBis ?? null, grund: b.grund ?? null,
            })),
          }
        : null,
      kanten: ergebnis.kanten,
      budgetErschoepft: ergebnis.budgetErschoepft === true,
      protokoll: ergebnis.protokoll,
      transport,
      zeitraum,
    })
  }))

  /** Start + Ziel (+ optionale Zwischenstopps als string[], + optionale Sperrzonen
   *  meide: [{lat,lng,radiusKm}] — die Engine sucht selbst den Weg aussen herum). */
  r.post("/startziel", asyncHandler(async (req, res) => {
    const start = typeof req.body?.start === "string" ? req.body.start.trim() : ""
    const ziel = typeof req.body?.ziel === "string" ? req.body.ziel.trim() : ""
    if (!start || !ziel) throw new ApiError(400, "Start und Ziel erforderlich")
    const vias = Array.isArray(req.body?.vias)
      ? req.body.vias.filter((v) => typeof v === "string" && v.trim())
      : []
    let out = await resolveRoute(db, { mode: "startziel", start, ziel, vias }, { nominatim, osrm })
    const zonen = parseMeide(req.body?.meide)
    let meideStatus = null
    if (zonen.length) {
      const ergebnis = await umfahreZonen(db, out, zonen, { osrm })
      out = ergebnis.out
      meideStatus = ergebnis.status
    }
    // Befahrene Strassen (A5, B462, …) aus den OSRM-Steps. Ohne sie plant der
    // KI-Agent blind: er soll Parallelachsen und andere Auffahrten vorschlagen,
    // weiss aber nicht, worauf seine eigene Route laeuft, und raet dann Ortsnamen
    // (Analyse 09.08.2026). Der Wert wird bereits fuer den Ueberfuehrungsfilter
    // berechnet, war hier aber nie Teil der Antwort. Fehlschlag ist unkritisch.
    const wpFuerRefs = Array.isArray(out.waypoints) && out.waypoints.length >= 2 ? out.waypoints : out.geometry
    const refs = osrm ? await osrm.roadRefs(wpFuerRefs).catch(() => null) : null

    res.json({
      points: out.geometry,
      waypoints: out.waypoints ?? null, // exakte Start/Ziel/Via-Punkte → statisch mit der Strecke speichern (T-582)
      distanzKm: out.distanzKm,
      dauerMin: out.dauerMin ?? null,
      provider: out.provider,
      qualitaet: routenQualitaet(out.geometry, out.distanzKm),
      befahreneStrassen: refs ? [...refs].sort() : null,
      ...(meideStatus ? { meideStatus } : {}),
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
