// Einmalige Geokodierung der Hessen-Brücken-PDF-Liste (Quelle 0126) via Nominatim.
// Die 136 Brücken sind ein statischer PDF-Stand ohne Koordinaten → Importer verwarf sie bisher.
// Wir backen ort-genaue lat/lng EINMALIG in 0126_hessen_bruecken.data.json (kein Runtime-Dependency).
// Nominatim-Policy: max 1 req/s, valider User-Agent mit Kontakt. Dedupe je Ort minimiert Requests.
//
// Aufruf:  node server/scripts/geocode_hessen_bruecken.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, "..", "src", "connectors", "0126_hessen_bruecken.data.json")
const UA = "Roadmap-Setreo/1.0 (klattigmaximilian@gmail.com)"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Ort-Freitext aus der PDF → Nominatim-taugliche Ortsangabe. */
function ortQuery(ortRaw) {
  let o = String(ortRaw ?? "").trim()
  if (!o) return null
  o = o.split("/")[0].trim() // "Rüdesheim am Rhein / Rüdesheim" → erste Variante
  o = o.replace(/\s*\([^)]*\)\s*/g, " ") // "Altweilnau (Landsteiner Mühle)" → "Altweilnau"
  o = o.replace(/^\d{4,5}\s+/, "") // "67547 Worms" → "Worms" (PLZ-Präfix raus)
  o = o.replace(/^(?:in|bei)\s+/i, "") // "in Knickhagen" / "bei Rüdesheim" → Ortsname
  o = o.replace(/\bFfm\b\.?-?/gi, "Frankfurt am Main ") // "Ffm-Schwanheim" → "Frankfurt am Main Schwanheim"
  o = o.replace(/\s+/g, " ").trim()
  // Orte mit PLZ können außerhalb Hessens liegen (Rheinbrücke 67547 Worms = RLP) → ohne Bundesland-Zwang.
  const hessen = /^\d{4,5}\s/.test(ortRaw) ? "" : ", Hessen"
  return o ? `${o}${hessen}, Deutschland` : null
}

// T-271 (Max 2026-06-21): zu grobe Treffer rausnehmen. Nominatim liefert bei nicht eindeutig
// auflösbarem Ort manchmal einen LANDKREIS/Bundesland-Zentroid statt der Stadt — der liegt km
// daneben und ist als Karten-Lage unbrauchbar. place_rank < 16 = gröber als Stadt/Ort
// (county≈12, state≈8) → verwerfen; ebenso explizit administrative Groß-Einheiten.
const COARSE_TYPES = new Set(["county", "state", "state_district", "region", "province", "country", "continent"])
function tooCoarse(hit) {
  const rank = Number(hit.place_rank)
  if (Number.isFinite(rank) && rank < 16) return true
  return COARSE_TYPES.has(hit.addresstype)
}

async function geocode(query) {
  // jsonv2 → liefert addresstype + place_rank für den Präzisions-Check.
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&q=" +
    encodeURIComponent(query)
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } })
    if (!r.ok) return null
    const j = await r.json()
    if (!Array.isArray(j) || !j.length) return null
    const hit = j[0]
    if (tooCoarse(hit)) return { coarse: true } // zu grob → kein brauchbarer Punkt
    const lat = Number(hit.lat), lng = Number(hit.lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

const data = JSON.parse(readFileSync(DATA, "utf-8"))
const bruecken = data.bruecken ?? []
const cache = new Map() // query → {lat,lng}|{coarse}|null
let hits = 0, miss = 0, grob = 0, idx = 0

for (const b of bruecken) {
  idx++
  const q = ortQuery(b.ort)
  if (!q) { b.lat = null; b.lng = null; miss++; continue }
  if (!cache.has(q)) {
    const res = await geocode(q)
    cache.set(q, res)
    await sleep(1100) // Nominatim-Rate-Limit (1 req/s) einhalten
  }
  const res = cache.get(q)
  if (res && res.lat != null) {
    b.lat = Math.round(res.lat * 1e6) / 1e6
    b.lng = Math.round(res.lng * 1e6) / 1e6
    hits++
  } else {
    // T-271: zu grob (Landkreis/Bundesland) ODER nicht gefunden → kein Punkt (fällt aus der Analyse).
    b.lat = null; b.lng = null
    if (res && res.coarse) grob++; else miss++
  }
  if (idx % 20 === 0) console.log(`  ${idx}/${bruecken.length} … (${hits} hits, ${grob} grob-raus, ${miss} miss, ${cache.size} uniq)`)
}

data.geokodiert = { verfahren: "nominatim", genauigkeit: "ort-genau, Kreis-/Land-Treffer verworfen (T-271)", stand: new Date().toISOString().slice(0, 10) }
writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n", "utf-8")
console.log(`FERTIG: ${hits}/${bruecken.length} ort-genau · ${grob} zu grob (raus) · ${miss} nicht gefunden · ${cache.size} eindeutige Orte`)
