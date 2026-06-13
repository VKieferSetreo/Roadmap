#!/usr/bin/env node
// Cron-Job: Rostock — Baustellen (OpenData.HRO) — Quellen-ID 0222.
// Zieht den GESAMTEN Baustellen-Bestand (statisches GeoJSON, geo.sv.rostock.de, WGS84), mappt in
// unser obstacle-Format v1.0 und schreibt zur VERIFIKATION rostock-baustellen.normalisiert.json.
// KEINE DB, NICHT die Engine.
// Lauf:  node rostock-baustellen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0222"
const QUELLE_NAME = "Rostock — Baustellen (OpenData.HRO)"
const PORTAL = "https://www.opendata-hro.de/dataset/baustellen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Statisches GeoJSON (CC0), ganzer Datensatz in einem Abruf — keine Pagination.
const URL = "https://geo.sv.rostock.de/download/opendata/baustellen/baustellen.json"
const data = await getJson(URL, { timeoutMs: 60000 })
const feats = data.features ?? []

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  // HRO-Schema: strasse_name, baumassnahme, verkehrsbeeintraechtigungen (plural), sparte,
  // baubeginn/bauende. Defensiv über mehrere Schlüssel mappen (Schema kann je Stand variieren).
  const strasse = p.strasse_name ?? p.strasse ?? p.adresse ?? p.lage ?? p.bezeichnung ?? null
  const massnahme = p.baumassnahme ?? p.massnahme ?? p.art ?? null
  const sperrInfo = p.verkehrsbeeintraechtigungen ?? p.verkehrsbeeintraechtigung ?? p.beeintraechtigung ?? p.sperrung ?? p.einschraenkung ?? null
  const text = [massnahme, sperrInfo, p.bemerkung, p.beschreibung].filter(Boolean).join(" ")
  const vollsperrung = /vollsperrung|voll gesperrt/i.test(text) || undefined
  const istSperrung = /sperrung|gesperrt/i.test(String(sperrInfo ?? ""))
  return makeObstacle({
    quellenId: QUELLE, externeId: p.uuid ?? p.id ?? p.objectid ?? f.id,
    kategorie: istSperrung ? "sperrung" : "baustelle", befristung: "temporaer",
    name: strasse ?? massnahme ?? "Baustelle Rostock",
    beschreibung: [massnahme, sperrInfo].filter(Boolean).join(" — ").trim() || null,
    lat: refLat(f.geometry), lng: refLng(f.geometry),
    geom: f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString" ? f.geometry : null,
    strassenRef: null,
    attrs: cleanAttrs({
      strasse: strasse ?? undefined,
      massnahme: massnahme ?? undefined,
      sparte: p.sparte ?? undefined,
      verkehrsbeeintraechtigung: sperrInfo ?? undefined,
      vollsperrung,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: dateOnly(p.baubeginn ?? p.von ?? p.beginn),
    gueltigVon: dateOnly(p.baubeginn ?? p.von ?? p.beginn),
    gueltigBis: dateOnly(p.bauende ?? p.bis ?? p.ende),
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
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "rostock-baustellen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Rostock Baustellen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Rostock 54.1/12.1 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
// Feldnamen-Diagnose (HRO-Schema), damit das Mapping bei Bedarf nachgeschärft werden kann:
if (feats[0]) console.log(`Roh-Property-Keys:`, Object.keys(feats[0].properties ?? {}).join(", "))
console.log(JSON.stringify(erg.beispiele[0], null, 2))
