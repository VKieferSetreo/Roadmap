#!/usr/bin/env node
// Cron-Job: Berlin VIZ — Baustellen, Sperrungen, Störungen (mdhwfs) — Quellen-ID 0114.
// Zieht den GESAMTEN Bestand (Layer baustellen_sperrungen), mappt ihn in unser obstacle-Format
// v1.0 und schreibt zur VERIFIKATION viz-berlin-baustellen.normalisiert.json. NICHT in die DB.
//
// GeoServer-WFS 2.0, outputFormat=application/json → sauberes GeoJSON in EPSG:4326 (keine
// Reprojektion). Geometrie ist GeometryCollection (Point + optional LineString). validity ist
// ein JSON-String { from, to } mit dd.mm.yyyy [HH:MM]. subtype unterscheidet Baustelle/Störung/...
//
// Lauf:  node viz-berlin-baustellen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, fetchAllFeatures, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText } from "../../../_lib/format.mjs"

const QUELLE = "0114"
const QUELLE_NAME = "Berlin VIZ — Baustellen/Sperrungen/Störungen (mdhwfs)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: GeoServer WFS 2.0, GeoJSON, EPSG:4326. count/startIndex-Pagination via fetchAllFeatures.
const BASE = "https://api.viz.berlin.de/geoserver/mdhwfs/wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=mdhwfs:baustellen_sperrungen&outputFormat=application/json&srsName=EPSG:4326"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 10 })
console.log(`VIZ-Features verfügbar: ${feats.length}`)

// subtype → unsere kategorie
function katAus(subtype) {
  const s = String(subtype ?? "").toLowerCase()
  if (s.includes("baustelle")) return "baustelle"
  if (s.includes("sperrung")) return "sperrung"
  return "sperrung" // Störung/Gefahr/Veranstaltung → neutraler Träger
}
// GeometryCollection → erster Punkt + ggf. LineString
function geomTeile(geometry) {
  if (!geometry) return { point: [null, null], line: null }
  const geoms = geometry.type === "GeometryCollection" ? geometry.geometries : [geometry]
  let point = [null, null], line = null
  for (const g of geoms) {
    if ((g.type === "Point") && point[0] == null) point = g.coordinates
    if ((g.type === "LineString" || g.type === "MultiLineString") && !line) line = g
  }
  if (point[0] == null && line) { let c = line.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; point = c }
  return { point, line }
}
// validity ist String '{ "from": "03.07.2025 18:00", "to": "..." }'
function validity(v) {
  if (!v) return { von: null, bis: null }
  try { const o = typeof v === "string" ? JSON.parse(v) : v; return { von: dateOnly(o.from), bis: dateOnly(o.to) } }
  catch { return { von: null, bis: null } }
}
function richtungAus(d) {
  const s = String(d ?? "").toLowerCase()
  if (s.includes("beid")) return "beide"
  return "beide"
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const { point, line } = geomTeile(f.geometry)
  const { von, bis } = validity(p.validity)
  const text = [p.section, p.content].filter(Boolean).join(" — ")
  const kat = katAus(p.subtype)
  const tonnage = tonnageAusText(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.id ?? f.id,
    kategorie: tonnage ? "gewicht" : kat, befristung: "temporaer",
    name: p.street || p.section || `${p.subtype ?? "Meldung"} Berlin`,
    beschreibung: text || null,
    lat: point[1], lng: point[0],
    geom: line,
    richtung: richtungAus(p.direction),
    strassenRef: refAus(`${p.street ?? ""} ${p.section ?? ""}`),
    attrs: cleanAttrs({
      subtype: p.subtype || undefined, severity: p.severity || undefined,
      maxGewichtT: tonnage ?? undefined, restbreiteM: meterAusText(text, /breite/i) ?? undefined,
      vollsperrung: /vollsperr|gesperrt/i.test(text) || undefined,
      netrefs: p.netrefs || undefined,
    }),
    gueltigVon: von, gueltigBis: bis, realerStart: von,
    quelleName: QUELLE_NAME, quelleUrl: "https://daten.berlin.de/datensaetze?groups=verkehr",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "viz-berlin-baustellen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
