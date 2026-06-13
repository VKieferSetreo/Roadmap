#!/usr/bin/env node
// Cron-Job: GST-Schwertransportkarte NRW — lastbeschränkte/gesperrte Brücken — Quellen-ID 0113.
// Goldstandard-Restriktion NRW (Straßen.NRW + Autobahn GmbH). ArcGIS-REST-FeatureServer,
// liefert je Bauwerk Bauwerksnummer + gewicht-Restriktion ("keine Schwertransporte"). Zieht den
// GESAMTEN Bestand (GeoJSON, WGS84), mappt in unser obstacle-Format v1.0 (befristung=dauerhaft) und
// schreibt gst-schwertransportkarte-nrw.normalisiert.json zur VERIFIKATION. KEINE DB, NICHT die Engine.
// Lauf:  node gst-schwertransportkarte-nrw.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, tonnageAusText, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0124"
const QUELLE_NAME = "GST-Schwertransportkarte NRW (lastbeschränkte Brücken)"
const QUELLE_URL = "https://www.arcgishostedserver.nrw.de/arcgis/rest/services/Hosted/last_bruecken1/FeatureServer/0"
const LAYER = `${QUELLE_URL}/query`
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand (live: 157 Bauwerke, maxRecordCount=2000 → eine Seite reicht). ArcGIS-Paging
// über resultOffset/resultRecordCount; f=geojson&outSR=4326 liefert WGS84-GeoJSON direkt.
async function ladeAlle({ pageSize = 2000, maxPages = 50 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const url = `${LAYER}?where=1%3D1&outFields=*&outSR=4326&f=geojson` +
      `&resultRecordCount=${pageSize}&resultOffset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs: 45000 })
    const feats = data.features ?? []
    all.push(...feats)
    if (feats.length < pageSize) break
  }
  return all
}

const feats = await ladeAlle()
console.log(`Brücken verfügbar: ${feats.length}`)

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = f.geometry?.coordinates ?? [null, null]
  const gewichtText = String(p.gewicht ?? "")
  const tonnage = tonnageAusText(gewichtText) // "..., max 16 to" → 16
  const komplettsperre = /keine schwertransporte/i.test(gewichtText)
  return makeObstacle({
    quellenId: QUELLE, externeId: (p.tbwnr ?? p.fid) != null ? String(p.tbwnr ?? p.fid).trim() : f.id,
    kategorie: "bruecke", befristung: "dauerhaft",
    name: p.bw_name || `Brücke ${p.tbwnr ?? ""}`.trim(),
    beschreibung: gewichtText || null,
    lat, lng,
    strassenRef: normRef(p.strkl, p.strnr),
    attrs: cleanAttrs({
      maxGewichtT: tonnage,
      grundsaetzlicheGstSperre: komplettsperre || undefined,
    }),
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL, roh: p, abgerufenAm: now,
  })
})

function normRef(strkl, strnr) {
  if (!strkl || strnr == null) return null
  const k = String(strkl).trim().toUpperCase()
  const n = String(strnr).trim()
  return k && n ? `${k}${n}` : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "gst-schwertransportkarte-nrw", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit GST-Sperre:`, obstacles.filter((o) => o.attrs.grundsaetzlicheGstSperre).length,
  `· mit Gewichtslimit:`, obstacles.filter((o) => o.attrs.maxGewichtT != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
