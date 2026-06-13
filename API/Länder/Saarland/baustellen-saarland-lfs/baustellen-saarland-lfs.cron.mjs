#!/usr/bin/env node
// Cron-Job: baustellen.saarland (LfS) — Baustellen, Sperrungen, Verkehrsmeldungen — Quellen-ID 0116.
// Offener GeoJSON-Feed (Leaflet-Portal), WGS84. Vier Feeds: roadworks point+line (gleiche Records,
// Punkt vs. Linie), verkehrsmeldungen point+line. Zieht den GESAMTEN Bestand, merged Punkt-
// (Referenzpunkt) + Linien-Geometrie je Datensatz, mappt in unser obstacle-Format v1.0 und schreibt
// baustellen-saarland-lfs.normalisiert.json zur VERIFIKATION. KEINE DB, NICHT die Engine.
// Lauf:  node baustellen-saarland-lfs.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, dateOnly, tonnageAusText, meterAusText, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0127"
const QUELLE_NAME = "baustellen.saarland (Landesbetrieb für Straßenbau)"
const QUELLE_URL = "https://baustellen.saarland/"
const BASE = "https://baustellen.saarland/data"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

const FEEDS = {
  rwPoint: `${BASE}/baustellen/roadworks_point_geojson.geojson`,
  rwLine: `${BASE}/baustellen/roadworks_line_geojson.geojson`,
  vmPoint: `${BASE}/verkehrsmeldungen/traffic_messages_point_geojson.geojson`,
  vmLine: `${BASE}/verkehrsmeldungen/traffic_messages_line_geojson.geojson`,
}

async function feats(url) { try { return (await getJson(url, { timeoutMs: 30000 })).features ?? [] } catch { return [] } }
const [rwP, rwL, vmP, vmL] = await Promise.all([feats(FEEDS.rwPoint), feats(FEEDS.rwLine), feats(FEEDS.vmPoint), feats(FEEDS.vmLine)])
console.log(`Feeds: roadworks point=${rwP.length} line=${rwL.length} · verkehrsmeldungen point=${vmP.length} line=${vmL.length}`)

// Linien-Geometrie je recordid indexieren (gleiche Records wie Punkt-Feed, nur als (Multi)LineString).
const lineByRec = new Map()
for (const f of [...rwL, ...vmL]) {
  const rec = f.properties?.recordid
  if (rec && (f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString")) lineByRec.set(rec, f.geometry)
}

const verfuegbar = rwP.length + vmP.length
const obstacles = [...rwP.map((f) => ["baustelle", f]), ...vmP.map((f) => ["meldung", f])].map(([herkunft, f]) => {
  const p = f.properties ?? {}
  const [lng, lat] = f.geometry?.coordinates ?? [null, null] // Punkt-Feed: WGS84 [lng,lat]
  const text = stripHtml(p.description ?? "")
  const istSperrung = String(p.roadclosed) === "true"
  const tonnage = tonnageAusText(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.recordid ?? f.id,
    kategorie: tonnage ? "gewicht" : istSperrung ? "sperrung" : herkunft === "baustelle" ? "baustelle" : "sperrung",
    befristung: "temporaer",
    name: erstZeile(text) ?? p.roadname ?? (istSperrung ? "Sperrung" : "Baustelle"),
    beschreibung: text || null,
    lat, lng,
    geom: lineByRec.get(p.recordid) ?? null,
    strassenRef: normRef(text) ?? normRef(p.roadname),
    attrs: cleanAttrs({
      maxGewichtT: tonnage,
      restbreiteM: meterAusText(text, /breite|einengung/i),
      vollsperrung: istSperrung || undefined,
    }),
    realerStart: dateOnly(p.starttime),
    gueltigVon: dateOnly(p.starttime),
    gueltigBis: dateOnly(p.endtime),
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL, roh: p, abgerufenAm: now,
  })
})

function stripHtml(s) { return String(s).replace(/<[^>]*>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim() }
function erstZeile(s) { return s ? s.split("\n").map((x) => x.trim()).find(Boolean) ?? null : null }
function normRef(s) {
  if (!s) return null
  const m = String(s).toUpperCase().match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "baustellen-saarland-lfs", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length,
  `· mit Linie:`, obstacles.filter((o) => o.geom != null).length)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
