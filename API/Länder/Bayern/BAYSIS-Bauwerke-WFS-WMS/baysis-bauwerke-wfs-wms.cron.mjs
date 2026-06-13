#!/usr/bin/env node
// Cron-Job: BAYSIS Bauwerke (Bayern) — Brücken + Tunnel-/Trogbauwerke — Quellen-ID 0112.
// Strukturierte GST-Restriktionsquelle (Höhen-/Gewichtsbeschränkung, Brückenklasse,
// Grundsätzliche_Schwertransportsperre, VNK/NNK/Station). Zieht den GESAMTEN Bestand
// (WFS GeoJSON, paginiert), mappt in unser obstacle-Format v1.0 (befristung=dauerhaft) und
// schreibt baysis-bauwerke-wfs-wms.normalisiert.json zur VERIFIKATION. KEINE DB, NICHT die Engine.
// Lauf:  node baysis-bauwerke-wfs-wms.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, meterAusText, tonnageAusText,
} from "../../../_lib/format.mjs"

const QUELLE = "0123"
const QUELLE_NAME = "BAYSIS Bauwerke (Bayerische Straßenbauverwaltung)"
const QUELLE_URL = "https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand (live: numberMatched=12287). ArcGIS-WFSServer liefert GeoJSON nativ in WGS84
// (outputFormat=GEOJSON&srsName=EPSG:4326) und paginiert über count/startIndex.
// VERIFIKATION: maxPages=4 (≈6000 Bauwerke, <60 s). FÜR DEN VOLLEN BESTAND: maxPages=13 setzen.
const BASE =
  "https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Bauwerke:bauwerke" +
  "&outputFormat=GEOJSON&srsName=EPSG:4326"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1500, maxPages: 4, timeoutMs: 60000 })
console.log(`Bauwerke geladen (Verifikations-Cap): ${feats.length}`)

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = f.geometry?.coordinates ?? [null, null] // Point, bereits WGS84 [lng,lat]
  const art = String(p.Art ?? "")
  const kategorie = /tunnel|trog/i.test(art) ? "tunnel" : "bruecke"
  const gstSperre = String(p.Grundsätzliche_Schwertransportsperre ?? "").trim().toLowerCase() === "vorhanden"
  return makeObstacle({
    quellenId: QUELLE, externeId: p.Bauwerksnummer ?? p.OBJECTID ?? f.id,
    kategorie, befristung: "dauerhaft",
    name: bauwerkName(p),
    beschreibung: art || null,
    lat, lng,
    strassenRef: normRef(p.Straßenbezeichnung),
    vnk: p.VNK ?? null, nnk: p.NNK ?? null, stationVon: (p.Station ?? null) || null,
    attrs: cleanAttrs({
      maxHoeheM: zahlMitEinheit(p.Höhenbeschränkung, "m"),
      maxGewichtT: zahlMitEinheit(p.Gewichtsbeschränkung, "t"),
      brueckenklasse: brueckenklasse(p.Brückenklasse),
      grundsaetzlicheGstSperre: gstSperre || undefined,
    }),
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL, roh: p, abgerufenAm: now,
  })
})

function bauwerkName(p) {
  const teile = [p.Art, p.Straßenbezeichnung, p.Bauwerksnummer && `BW ${p.Bauwerksnummer}`].filter(Boolean)
  return teile.join(" ") || "Bauwerk"
}
function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b(A|B|ST|L|K)\s?\d{1,4}\b/)
  return m ? m[0].replace(/\s/, "") : null
}
// "3,60 m" / "4,0" / "30" / "6,0 t" → Zahl. meter-/tonnage-Helfer fallen bei bloßer Zahl ohne Einheit
// zurück, daher hier robust direkt parsen.
function zahlMitEinheit(v, einheit) {
  if (v == null || String(v).trim() === "") return null
  const s = String(v).replace(",", ".")
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}
function brueckenklasse(v) {
  if (!v) return null
  const s = String(v).replace(/\s+/g, " ").trim() // " DIN: 30          " → "DIN: 30"
  return s || null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "baysis-bauwerke-wfs-wms", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`geladen: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit Höhenlimit:`, obstacles.filter((o) => o.attrs.maxHoeheM != null).length,
  `· mit Gewichtslimit:`, obstacles.filter((o) => o.attrs.maxGewichtT != null).length,
  `· mit GST-Sperre:`, obstacles.filter((o) => o.attrs.grundsaetzlicheGstSperre).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele.find((o) => o.attrs.grundsaetzlicheGstSperre) ?? erg.beispiele[0], null, 2))
