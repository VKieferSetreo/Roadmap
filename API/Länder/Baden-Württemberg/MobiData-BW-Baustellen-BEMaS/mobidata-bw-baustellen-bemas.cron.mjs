#!/usr/bin/env node
// Cron-Job: MobiData BW — Baustelleninformationen (BEMaS) — Quellen-ID 0110.
// Zieht den GESAMTEN aktuellen Baustellen-Bestand (GeoJSON-Feed, B/L/K), mappt ihn in unser
// obstacle-Format v1.0 und schreibt das Ergebnis zur VERIFIKATION nach
// mobidata-bw-baustellen-bemas.normalisiert.json. KEINE DB, NICHT die Engine.
// Quellen-ID-Block Länder SÜD/WEST: 0122–0128 (0110–0121 anderweitig belegt).
// Lauf:  node mobidata-bw-baustellen-bemas.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, dateOnly, tonnageAusText, meterAusText, schreibeErgebnis,
} from "../../../_lib/format.mjs"

const QUELLE = "0128"
const QUELLE_NAME = "MobiData BW — Baustelleninformationen (BEMaS)"
const QUELLE_URL = "https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg"
const BASE = "https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json"
const UA = "Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// 1) GESAMTER Bestand: ein einziger GeoJSON-Feed (keine Pagination nötig — Feed liefert alles, WGS84).
const data = await getJson(BASE, { headers: { "user-agent": UA }, timeoutMs: 45000 })
const feats = data.features ?? []
console.log(`Features verfügbar: ${feats.length}`)

// 2) je Feature → obstacle. type: CONSTRUCTION = Baustelle, ROAD_CLOSED = Sperrung.
const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  const istSperrung = String(p.type ?? "").toUpperCase().includes("ROAD_CLOSED")
  const text = [p.description, p.subtype].filter(Boolean).join(" ")
  const tonnage = tonnageAusText(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.id ?? f.id,
    kategorie: tonnage ? "gewicht" : istSperrung ? "sperrung" : "baustelle",
    befristung: "temporaer",
    name: p.description || p.street || (istSperrung ? "Sperrung" : "Baustelle"),
    beschreibung: p.description || null,
    lat, lng,
    geom: (f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString") ? f.geometry : null,
    richtung: mapRichtung(p.direction),
    strassenRef: strasseAusText(p.street),
    attrs: cleanAttrs({
      restbreiteM: meterAusText(text, /breite|einengung/i),
      maxGewichtT: tonnage,
      vollsperrung: istSperrung || undefined,
    }),
    realerStart: dateOnly(p.starttime),
    gueltigVon: dateOnly(p.starttime),
    gueltigBis: dateOnly(p.endtime),
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL, roh: p, abgerufenAm: now,
  })
})

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null] // Feed ist bereits WGS84 [lng,lat]
}
function strasseAusText(s) {
  if (!s) return null
  const m = String(s).match(/\b([ABLK]\s?\d{1,4})\b/) // "K1077 Böblingen-Gärtringen" → K1077
  return m ? m[1].replace(/\s/, "") : null
}
function mapRichtung(d) {
  const s = String(d ?? "").toUpperCase()
  if (s === "ONE_DIRECTION") return "hin"
  return "beide"
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "mobidata-bw-baustellen-bemas", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
