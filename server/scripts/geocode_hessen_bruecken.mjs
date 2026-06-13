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
  o = o.replace(/^bei\s+/i, "") // "bei Rüdesheim" → "Rüdesheim"
  o = o.replace(/\bFfm\b\.?-?/gi, "Frankfurt am Main ") // "Ffm-Schwanheim" → "Frankfurt am Main Schwanheim"
  o = o.replace(/\s+/g, " ").trim()
  return o ? `${o}, Hessen, Deutschland` : null
}

async function geocode(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=" +
    encodeURIComponent(query)
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } })
    if (!r.ok) return null
    const j = await r.json()
    if (!Array.isArray(j) || !j.length) return null
    const lat = Number(j[0].lat), lng = Number(j[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

const data = JSON.parse(readFileSync(DATA, "utf-8"))
const bruecken = data.bruecken ?? []
const cache = new Map() // query → {lat,lng}|null
let hits = 0, miss = 0, idx = 0

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
  if (res) {
    b.lat = Math.round(res.lat * 1e6) / 1e6
    b.lng = Math.round(res.lng * 1e6) / 1e6
    hits++
  } else {
    b.lat = null; b.lng = null; miss++
  }
  if (idx % 20 === 0) console.log(`  ${idx}/${bruecken.length} … (${hits} hits, ${miss} miss, ${cache.size} uniq)`)
}

data.geokodiert = { verfahren: "nominatim", genauigkeit: "ort-genau", stand: new Date().toISOString().slice(0, 10) }
writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n", "utf-8")
console.log(`FERTIG: ${hits}/${bruecken.length} geokodiert · ${miss} ohne Koords · ${cache.size} eindeutige Orte`)
