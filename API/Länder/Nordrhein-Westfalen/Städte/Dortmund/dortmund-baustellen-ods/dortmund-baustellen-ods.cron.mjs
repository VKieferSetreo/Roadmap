#!/usr/bin/env node
// Cron-Job: Dortmund — Baustellen (Opendatasoft Explore API v2.1) — Quellen-ID 0216.
// Zieht den GESAMTEN Bestand aus den Punkt-Datensätzen (tagesaktuell + geplant), mappt in unser
// obstacle-Format v1.0 (Koordinaten WGS84 in geografische_koordinate.lon/lat) und schreibt zur
// VERIFIKATION dortmund-baustellen-ods.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node dortmund-baustellen-ods.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0216"
const QUELLE_NAME = "Dortmund — Baustellen (Opendatasoft)"
const PORTAL = "https://open-data.dortmund.de/explore/?q=baustelle"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Opendatasoft v2.1 records-API. Pagination via limit/offset (max limit=100). Punkt-Datensätze:
// (Flächen-Varianten existieren auch, liefern aber dieselben Vorgänge ohne Punkt → hier weggelassen.)
const DATASETS = [
  { id: "fb66-baustellen-tagesaktuell", phase: "tagesaktuell" },
  { id: "fb66-baustellen-geplant", phase: "geplant" },
]
const BASE = "https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets"
const LIMIT = 100

let verfuegbar = 0
const obstacles = []
for (const ds of DATASETS) {
  for (let offset = 0; ; offset += LIMIT) {
    let data
    try {
      data = await getJson(`${BASE}/${ds.id}/records?limit=${LIMIT}&offset=${offset}`, { timeoutMs: 45000 })
    } catch (e) {
      console.warn(`WARN ${ds.id}@${offset}: ${e.message}`)
      break
    }
    const rows = data.results ?? []
    if (offset === 0) verfuegbar += data.total_count ?? rows.length
    for (const p of rows) {
      // Feldname unterscheidet sich je Datensatz: tagesaktuell = geografische_koordinate,
      // geplant = geo_point_2d. Beide liefern {lon,lat} WGS84.
      const geo = p.geografische_koordinate ?? p.geo_point_2d ?? {}
      const text = [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" ")
      const vollsperrung = /vollsperrung/i.test(text) || undefined
      obstacles.push(makeObstacle({
        quellenId: QUELLE, externeId: `${ds.id}-${p.von ?? ""}-${geo.lon}-${geo.lat}`,
        kategorie: "baustelle", befristung: "temporaer",
        name: p.art_der_baumassnahme ?? "Baustelle Dortmund",
        beschreibung: [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" — ").trim() || null,
        lat: geo.lat, lng: geo.lon,
        strassenRef: null,
        attrs: cleanAttrs({
          auftraggeber: p.auftraggeber ?? undefined,
          stadtbezirk: p.stadtbezirk ?? undefined,
          phase: ds.phase,
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        }),
        realerStart: p.von ?? null,
        gueltigVon: p.von ?? null,
        gueltigBis: p.bis ?? null,
        quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
      }))
    }
    if (rows.length < LIMIT) break
    if (offset > 10000) break // Sicherheits-Cap
  }
  console.log(`  ${ds.phase}: ${obstacles.filter((o) => o.attrs.phase === ds.phase).length} Datensätze`)
}

function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "dortmund-baustellen-ods", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`=== VERIFIKATION Dortmund Baustellen ===`)
console.log(`verfügbar (total_count): ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Dortmund 51.5/7.5 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
