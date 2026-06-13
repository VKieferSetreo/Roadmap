#!/usr/bin/env node
// Cron-Job: Overpass API (OpenStreetMap) — Quellen-ID 0301.
// Zieht GST-relevante OSM-Restriktionen (maxheight/maxweight/maxwidth/maxaxleload + bridge/tunnel),
// mappt sie in unser obstacle-Format v1.0 und schreibt das Ergebnis zur VERIFIKATION nach
// overpass-api.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
// Lauf:  node overpass-api.cron.mjs
//
// HINWEIS PAGINATION/UMFANG: Voll-DE über Overpass ist zu groß/last-intensiv (Timeout) — der
// VOLL-DE-Query steht unten kommentiert (DE_QUERY), für den laufenden Cron-Betrieb wäre er auf eine
// eigene Overpass-Instanz oder Geofabrik-Bulk umzustellen. Für die VERIFIKATION ziehen wir hier eine
// begrenzte BBOX (Großraum Berlin) — schnell (<60s) und repräsentativ für alle Restriktions-Tags.
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, schreibeErgebnis } from "../../_lib/format.mjs"

const QUELLE = "0301"
const QUELLE_NAME = "Overpass API (OpenStreetMap)"
const ENDPOINT = "https://overpass-api.de/api/interpreter"
const UA = "Roadmap-Setreo-Cron/1.0 (klattigmaximilian@gmail.com)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Tags, die ein Strecken-Hindernis markieren. Reihenfolge unten = Query-Filter.
const RESTRIKTIONS_TAGS = ["maxheight", "maxweight", "maxweight:rating:hgv", "maxwidth", "maxaxleload"]

// --- VOLL-DE-Query (für laufenden Cron-Betrieb; eigene Instanz nötig — hier NICHT ausgeführt) ---
// const DE_QUERY = `[out:json][timeout:600];area["ISO3166-1"="DE"][admin_level=2]->.de;(
//   way["maxheight"](area.de); way["maxweight"](area.de); way["maxweight:rating:hgv"](area.de);
//   way["maxwidth"](area.de); way["maxaxleload"](area.de);
// );out tags geom;`
// → für DE-weit: in mehrere Bundesland-Areas (admin_level=4) chunken, je Chunk einzeln ziehen
//   (Pagination ≈ geografisches Chunking, da Overpass keinen Offset kennt), Ergebnisse mergen.

// --- VERIFIKATIONS-Query: begrenzte BBOX Großraum Berlin (süd,west,nord,ost) ---
const BBOX = "52.35,13.10,52.68,13.77"
const tagFilter = RESTRIKTIONS_TAGS.map((t) => `way["${t}"](${BBOX});`).join("")
const VERIFY_QUERY = `[out:json][timeout:90];(${tagFilter});out tags geom;`

async function overpass(query) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(120000),
  })
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`)
  return r.json()
}

/** OSM-Maßangabe → Zahl. Sentinels ("none"/"default"/"no_sign"/"unsigned") = keine echte Grenze. */
function osmMass(v) {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (!s || ["none", "default", "no_sign", "unsigned", "no", "yes"].includes(s)) return null
  // "3.8", "3.8 m", "2,5", "7.5 t", "12'6\"" (ft/in selten in DE) → erste Dezimalzahl in Metern/Tonnen
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** Kategorie aus den Tags: Bauwerk (tunnel/bridge) hat Vorrang, sonst nach restriktivem Maß. */
function kategorieAus(tags, maxHoeheM, maxBreiteM, maxGewichtT) {
  if (tags.tunnel && tags.tunnel !== "no") return "tunnel"
  if (tags.bridge && tags.bridge !== "no") return "bruecke"
  if (maxHoeheM != null || maxBreiteM != null) return "engstelle"
  if (maxGewichtT != null) return "gewicht"
  return "engstelle"
}

function geomVonElement(el) {
  if (!Array.isArray(el.geometry) || el.geometry.length === 0) return { lat: null, lng: null, geom: null }
  const coords = el.geometry.map((p) => [p.lon, p.lat])
  const lat0 = el.geometry[0].lat
  const lng0 = el.geometry[0].lon
  const geom = coords.length >= 2 ? { type: "LineString", coordinates: coords } : null
  return { lat: lat0, lng: lng0, geom }
}

function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const data = await overpass(VERIFY_QUERY)
const elements = (data.elements ?? []).filter((e) => e.type === "way" && e.tags)
console.log(`OSM-Ways mit Restriktions-Tag (BBOX Berlin): ${elements.length}`)
console.log(`osm_base: ${data.osm3s?.timestamp_osm_base ?? "?"}`)

const obstacles = []
let uebersprungen = 0
for (const el of elements) {
  const t = el.tags
  const maxHoeheM = osmMass(t.maxheight)
  const maxBreiteM = osmMass(t.maxwidth)
  // maxweight:rating:hgv ist die LKW-spezifische Tragfähigkeit → bevorzugt vor generischem maxweight
  const maxGewichtT = osmMass(t["maxweight:rating:hgv"]) ?? osmMass(t.maxweight)
  const maxAchslastT = osmMass(t.maxaxleload)

  // Nur Datensätze mit mind. einem echten Grenzwert (Sentinels rausgefiltert) sind Hindernisse
  if (maxHoeheM == null && maxBreiteM == null && maxGewichtT == null && maxAchslastT == null) {
    uebersprungen++
    continue
  }

  const { lat, lng, geom } = geomVonElement(el)
  const kategorie = kategorieAus(t, maxHoeheM, maxBreiteM, maxGewichtT)
  const strassenRef = t.ref ?? null
  const name = t.name ?? t.ref ?? (t.bridge && t.bridge !== "no" ? "Brücke (OSM)" : t.tunnel && t.tunnel !== "no" ? "Tunnel (OSM)" : "Restriktion (OSM)")

  obstacles.push(makeObstacle({
    quellenId: QUELLE, externeId: `way/${el.id}`, kategorie,
    befristung: "dauerhaft", // OSM-Restriktionen sind dauerhafte Bauwerks-/Beschilderungs-Grenzen
    name, beschreibung: t.highway ? `OSM highway=${t.highway}` : null,
    lat, lng, geom,
    strassenRef,
    attrs: cleanAttrs({ maxHoeheM, maxBreiteM, maxGewichtT, maxAchslastT }),
    quelleName: QUELLE_NAME, quelleUrl: `https://www.openstreetmap.org/way/${el.id}`,
    roh: el, abgerufenAm: now, status: "gemeldet",
  }))
}

const erg = await schreibeErgebnis(HIER, "overpass-api", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: elements.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar (Ways m. Tag): ${elements.length} · ohne echten Grenzwert übersprungen: ${uebersprungen} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`Grenzwert-Treffer:`, {
  maxHoeheM: obstacles.filter((o) => o.attrs.maxHoeheM != null).length,
  maxBreiteM: obstacles.filter((o) => o.attrs.maxBreiteM != null).length,
  maxGewichtT: obstacles.filter((o) => o.attrs.maxGewichtT != null).length,
  maxAchslastT: obstacles.filter((o) => o.attrs.maxAchslastT != null).length,
})
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
