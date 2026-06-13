#!/usr/bin/env node
// Cron-Job: Bedarfsumleitungen Hamburg (BWVI) — Quellen-ID 0113.
// Zieht den GESAMTEN Bestand ausgeschilderter Notumleitungen für BAB + autobahnähnliche
// Bundesstraßen (VZ 460/455), mappt ihn in unser obstacle-Format v1.0 und schreibt zur
// VERIFIKATION bedarfsumleitungen-hamburg.normalisiert.json. Schreibt NICHT in die DB.
//
// Fachlich: Umleitungsstrecken sind GST-relevant als Ausweichkorridore bei Sperrungen.
// befristung=dauerhaft (ausgeschilderte Dauer-Bedarfsumleitungen), kategorie=sperrung-neutral
// mit Marker umleitung=true. LineString-Geometrie + VNK/NNK + Station mitgeführt.
//
// HINWEIS: deegree geo+json hier unzuverlässig → GML-Parsing. LineString in EPSG:25832 → z32.
// Lauf:  node bedarfsumleitungen-hamburg.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis, utmZuWgs84 } from "../../../_lib/format.mjs"

const QUELLE = "0113"
const QUELLE_NAME = "Bedarfsumleitungen Hamburg (BWVI)"
const HIER = dirname(fileURLToPath(import.meta.url))
const BASE = "https://geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen"
const now = new Date().toISOString()

// Voller Bestand via WFS 1.1.0 + maxFeatures (GML). 2109 Features total (numberMatched).
const url = `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=app:bedarfsumleitungen` +
  `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
const xml = await getText(url, { timeoutMs: 90000 })

function parseGml(xml, local, ns) {
  const out = []
  const re = new RegExp(`<${ns}:${local}\\b[^>]*gml:id="([^"]*)"[^>]*>([\\s\\S]*?)</${ns}:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const gmlId = m[1], block = m[2]
    const props = {}
    const pre = new RegExp(`<${ns}:([a-z_0-9]+)>([^<]*)</${ns}:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) if (!(pm[1] in props)) props[pm[1]] = pm[2].trim()
    // LineString posList: "E N E N ..." → [[lng,lat],...]
    const pl = block.match(/<gml:posList[^>]*>([\d.\s\-]+)<\/gml:posList>/)
    let coords = null
    if (pl) {
      const nums = pl[1].trim().split(/\s+/).map(Number)
      coords = []
      for (let i = 0; i + 1 < nums.length; i += 2) coords.push(utmZuWgs84(nums[i], nums[i + 1], 32))
    }
    out.push({ gmlId, props, coords })
  }
  return out
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const feats = parseGml(xml, "bedarfsumleitungen", "app")
console.log(`Bedarfsumleitungen verfügbar: ${feats.length}`)

const obstacles = feats.map(({ gmlId, props: p, coords }) => {
  const first = coords?.[0] ?? [null, null]
  return makeObstacle({
    quellenId: QUELLE, externeId: gmlId,
    kategorie: "sperrung", befristung: "dauerhaft",
    name: `Bedarfsumleitung ${p.umleitung ?? ""} (${p.strassenname ?? ""})`.trim(),
    beschreibung: p.wegeart ? `${p.wegeart}${p.umleitung ? ` · ${p.umleitung}` : ""}` : null,
    lat: first[1], lng: first[0],
    geom: coords && coords.length > 1 ? { type: "LineString", coordinates: coords } : null,
    richtung: p.richtung === "in Stationierungsrichtung" ? "hin"
      : p.richtung === "gegen Stationierungsrichtung" ? "rueck" : "beide",
    strassenRef: p.strassenschluessel ?? (p.strassenname?.match(/\b([ABLK])\s?(\d{1,4})\b/)?.slice(1, 3).join("") ?? null),
    vnk: p.von_netzknoten ?? null, nnk: p.nach_netzknoten ?? null,
    stationVon: p.von_station ?? null, stationBis: p.bis_station ?? null,
    attrs: cleanAttrs({ umleitung: true, umleitungsnummer: p.umleitung || undefined }),
    quelleName: QUELLE_NAME, quelleUrl: BASE, roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "bedarfsumleitungen-hamburg", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`mit VNK/NNK:`, obstacles.filter((o) => o.vnk != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
