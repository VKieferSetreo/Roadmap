#!/usr/bin/env node
// Cron-Job: Münster — Baustellen (geo.stadt-muenster.de MapServer, WFS) — Quellen-ID 0215.
// Zieht den GESAMTEN Bestand (WFS 1.1.0 GeoJSON, LineString/Point, CRS84 = WGS84 lng/lat),
// mappt in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// muenster-baustellen-wfs.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node muenster-baustellen-wfs.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0215"
const QUELLE_NAME = "Münster — Baustellen (geo.stadt-muenster.de, MapServer WFS)"
const PORTAL = "https://opendata.stadt-muenster.de/dataset/baustellen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// UMN MapServer, WFS 1.1.0. SRSNAME=EPSG:4326 → kommt als CRS84 (lng,lat-Reihenfolge, schon WGS84).
// MapServer ohne Offset-Pagination → ein Voll-Request (Bestand klein). MAXFEATURES großzügig.
const URL =
  "https://geo.stadt-muenster.de/mapserv/odbaustellen_serv?SERVICE=WFS&VERSION=1.1.0" +
  "&REQUEST=GetFeature&TYPENAME=baustellen&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&MAXFEATURES=10000"
const data = await getJson(URL, { timeoutMs: 60000 })
const feats = data.features ?? []

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const typBez = String(p.typ_bez ?? "")
  const text = [p.bezeichnung, p.information].filter(Boolean).join(" ")
  const vollsperrung = /vollsperrung/i.test(typBez) || /vollsperr/i.test(text) || undefined
  const istSperrung = /sperrung/i.test(typBez)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.fuid ?? f.id, kategorie: istSperrung ? "sperrung" : "baustelle",
    befristung: "temporaer",
    name: p.bezeichnung ?? "Baustelle Münster",
    beschreibung: p.information ?? null,
    lat: refLat(f.geometry), lng: refLng(f.geometry),
    geom: f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString" ? f.geometry : null,
    strassenRef: refAusBezeichnung(p.bezeichnung),
    attrs: cleanAttrs({
      typBez: typBez || undefined,
      vollsperrung,
      ansprechpartner: p.gesamtname1 || undefined,
      telefon: p.telefonansprechpartner1 || undefined,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: dateOnly(p.beginntam),
    gueltigVon: dateOnly(p.beginntam),
    gueltigBis: dateOnly(p.endetam),
    quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
  })
})

function refLng(geom) { return ersterPunkt(geom)[0] }
function refLat(geom) { return ersterPunkt(geom)[1] }
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return [c[0], c[1]]
}
// "B51 - Brückenneubau" → "B51"
function refAusBezeichnung(b) {
  const m = String(b ?? "").match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "muenster-baustellen-wfs", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Münster Baustellen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length} · mit geom: ${obstacles.filter((o) => o.geom).length}`)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Münster 51.96/7.62 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
