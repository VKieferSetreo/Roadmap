#!/usr/bin/env node
// Cron-Job: MobiData BW — Verkehrsmeldungen (LMS BW, TIC3-XML) — Quellen-ID 0111.
// Zieht den GESAMTEN aktuellen Meldungsbestand (Sperrungen/Gefahren/Unfälle, A/B/L/K),
// mappt ihn in unser obstacle-Format v1.0 und schreibt das Ergebnis zur VERIFIKATION nach
// mobidata-bw-verkehrsmeldungen-lms.normalisiert.json. KEINE DB, NICHT die Engine.
// TIC3 ist XML → dependency-freier Regex-Parser (Builtins only). Lauf: node *.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0122"
const QUELLE_NAME = "MobiData BW — Verkehrsmeldungen (LMS BW)"
const QUELLE_URL = "https://mobidata-bw.de/dataset/meldung"
const BASE = "https://api.mobidata-bw.de/datasets/traffic/incidents-bw/TIC3-Meldungen.xml"
const UA = "Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// 1) GESAMTER Bestand: ein TIC3-XML-Dokument (alle aktuellen Meldungen, ~10-Min-Update, WGS84).
const xml = await getText(BASE, { headers: { "user-agent": UA }, timeoutMs: 45000 })
const blocks = xml.match(/<TrafficAndTravelEvent>[\s\S]*?<\/TrafficAndTravelEvent>/g) ?? []
console.log(`Meldungen verfügbar: ${blocks.length}`)

const obstacles = blocks.map((b) => {
  const ticId = pick(b, /<TicId>([^<]+)<\/TicId>/)
  const dataId = pick(b, /<DataIdentifier>([^<]+)<\/DataIdentifier>/)
  const beschr = decode(pick(b, /<Description><Culture>\d+<\/Culture><Text>([\s\S]*?)<\/Text>/) ?? "").trim() || null
  const roadNr = pick(b, /<RoadNumber>[\s\S]*?<Number>([^<]+)<\/Number>/)
  // Shape-Koordinaten (Latitude/Longitude-Paare) → Referenzpunkt + Linie:
  const coords = [...b.matchAll(/<Coordinate><Latitude>([-\d.]+)<\/Latitude><Longitude>([-\d.]+)<\/Longitude><\/Coordinate>/g)]
    .map((m) => [Number(m[2]), Number(m[1])]) // → [lng, lat]
  const [lng, lat] = coords[0] ?? [null, null]
  const txt = (beschr ?? "").toLowerCase()
  const istSperrung = /gesperrt|sperrung|vollsperr/.test(txt)
  return makeObstacle({
    quellenId: QUELLE, externeId: dataId ?? ticId,
    kategorie: istSperrung ? "sperrung" : "sperrung", // LMS = Sperrungen/Gefahren → sperrung-Kategorie
    befristung: "temporaer",
    name: erstZeile(beschr) ?? `Verkehrsmeldung ${roadNr ?? ""}`.trim(),
    beschreibung: beschr,
    lat, lng,
    geom: coords.length > 1 ? { type: "LineString", coordinates: coords } : null,
    strassenRef: normRef(roadNr),
    attrs: cleanAttrs({ vollsperrung: /vollsperr/.test(txt) || undefined }),
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
    roh: { ticId, dataId, roadNr, beschreibung: beschr }, abgerufenAm: now,
  })
})

function pick(s, re) { const m = s.match(re); return m ? m[1] : null }
function erstZeile(s) { return s ? s.split("\n")[0].trim() || null : null }
function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "mobidata-bw-verkehrsmeldungen-lms", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: blocks.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${blocks.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Straßen-Ref:`, obstacles.filter((o) => o.strassen_ref != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
