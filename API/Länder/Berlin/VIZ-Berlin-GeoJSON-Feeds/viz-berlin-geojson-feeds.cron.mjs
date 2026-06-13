#!/usr/bin/env node
// Cron-Job: Berlin VIZ — GeoJSON-Feeds (Verkehrsredaktion + Landesmeldestelle TIC3) — Quellen-ID 0115.
// Zieht den GESAMTEN Bestand beider statischen GeoJSON-Feeds (1 GET je Feed, EPSG:4326),
// mappt ihn in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// viz-berlin-geojson-feeds.normalisiert.json. Schreibt NICHT in die DB.
//
// Diese Feeds sind die einfachste Berlin-Integration (fertiges GeoJSON, keine WFS-Pagination).
// Geometrie ist Point ODER GeometryCollection (Point + LineString). validity = { from, to } (dd.mm.yyyy [HH:MM]).
// Dedupe gegen 0114 (VIZ-WFS) erfolgt später DB-seitig — hier bewusst beide Feeds als eigene Quelle.
//
// Lauf:  node viz-berlin-geojson-feeds.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText } from "../../../_lib/format.mjs"

const QUELLE = "0115"
const QUELLE_NAME = "Berlin VIZ — GeoJSON-Feeds (Verkehrsredaktion + TIC3)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

const FEEDS = [
  { url: "https://api.viz.berlin.de/daten/baustellen_sperrungen_viz.json", herkunft: "Verkehrsredaktion" },
  { url: "https://api.viz.berlin.de/tic3/baustellen_sperrungen_tic.json", herkunft: "Landesmeldestelle (TIC3)" },
]

function katAus(subtype) {
  const s = String(subtype ?? "").toLowerCase()
  if (s.includes("baustelle")) return "baustelle"
  if (s.includes("sperrung")) return "sperrung"
  return "sperrung"
}
function geomTeile(geometry) {
  if (!geometry) return { point: [null, null], line: null }
  const geoms = geometry.type === "GeometryCollection" ? geometry.geometries : [geometry]
  let point = [null, null], line = null
  for (const g of geoms) {
    if (g.type === "Point" && point[0] == null) point = g.coordinates
    if ((g.type === "LineString" || g.type === "MultiLineString") && !line) line = g
  }
  if (point[0] == null && line) { let c = line.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; point = c }
  return { point, line }
}
function validity(v) {
  if (!v || typeof v !== "object") return { von: null, bis: null }
  return { von: dateOnly(v.from), bis: dateOnly(v.to) }
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = []
let verfuegbar = 0
for (const { url, herkunft } of FEEDS) {
  let fc
  try { fc = await getJson(url, { timeoutMs: 45000 }) } catch (e) { console.error(`${herkunft}: ${e.message}`); continue }
  const feats = fc.features ?? []
  verfuegbar += feats.length
  console.log(`${herkunft}: ${feats.length} Features`)
  for (const f of feats) {
    const p = f.properties ?? {}
    const { point, line } = geomTeile(f.geometry)
    const { von, bis } = validity(p.validity)
    const text = [p.section, p.content].filter(Boolean).join(" — ")
    const kat = katAus(p.subtype)
    const tonnage = tonnageAusText(text)
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: p.id ?? f.id,
      kategorie: tonnage ? "gewicht" : kat, befristung: "temporaer",
      name: p.street || p.section || `${p.subtype ?? "Meldung"} Berlin`,
      beschreibung: text || null,
      lat: point[1], lng: point[0], geom: line,
      strassenRef: refAus(`${p.street ?? ""} ${p.section ?? ""}`),
      attrs: cleanAttrs({
        feed: herkunft, subtype: p.subtype || undefined,
        maxGewichtT: tonnage ?? undefined, restbreiteM: meterAusText(text, /breite/i) ?? undefined,
        vollsperrung: /vollsperr|gesperrt/i.test(text) || undefined,
      }),
      gueltigVon: von, gueltigBis: bis, realerStart: von,
      quelleName: QUELLE_NAME, quelleUrl: url, roh: p, abgerufenAm: now,
    }))
  }
}

const erg = await schreibeErgebnis(HIER, "viz-berlin-geojson-feeds", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
