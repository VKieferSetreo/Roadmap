#!/usr/bin/env node
// Cron-Job: Köln — Verkehrsbeeinträchtigungen (ArcGIS Verkehrskalender) — Quellen-ID 0212.
// Zieht den GESAMTEN Bestand (ArcGIS REST MapServer Layer 0 "Standort", GeoJSON EPSG:4326),
// mappt in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// koeln-verkehrsbeeintraechtigungen.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node koeln-verkehrsbeeintraechtigungen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0212"
const QUELLE_NAME = "Köln — Verkehrsbeeinträchtigungen (ArcGIS Verkehrskalender)"
const PORTAL = "https://offenedaten-koeln.de/dataset/verkehrsbeeinträchtigungen-stadt-köln"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// ArcGIS REST. Layer 0 = "Standort" (TYP-codierte Punkte, schon EPSG:4326). Browser-UA empfohlen.
// Volle Pagination via resultOffset/resultRecordCount (exceededTransferLimit signalisiert mehr).
const LAYER0 = "https://geoportal.stadt-koeln.de/arcgis/rest/services/verkehr/verkehrskalender/MapServer/0/query"
const PAGE = 1000
const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-cron/1.0)" }, timeoutMs: 60000 }

const feats = []
for (let offset = 0; ; offset += PAGE) {
  const url = `${LAYER0}?where=1=1&outFields=*&outSR=4326&f=geojson&resultRecordCount=${PAGE}&resultOffset=${offset}`
  const data = await getJson(url, HEAD)
  const f = data.features ?? []
  feats.push(...f)
  const mehr = data.exceededTransferLimit || data.properties?.exceededTransferLimit
  if (!mehr || f.length === 0) break
  if (offset > 100000) break // Sicherheits-Cap
}

// TYP-Codes: 1=Strecke, 2=Bereich/Standort, 3=Verkehrslage. Baustelle/Sperrung mappen wir nach Text.
const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  const text = String(p.beschreibung ?? "")
  const istSperrung = /gesperrt|sperrung|nicht möglich|keine einfahrt/i.test(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.objectid ?? f.id, kategorie: istSperrung ? "sperrung" : "baustelle",
    befristung: "temporaer",
    name: p.name ?? "Verkehrsbeeinträchtigung Köln",
    beschreibung: text.trim() || null,
    lat, lng,
    strassenRef: null,
    attrs: cleanAttrs({
      typ: p.typ ?? undefined,
      vollsperrung: /voll.?gesperrt|vollsperrung/i.test(text) || undefined,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: epochToDate(p.datum_von),
    gueltigVon: epochToDate(p.datum_von),
    gueltigBis: epochToDate(p.datum_bis),
    quelleName: QUELLE_NAME, quelleUrl: p.link ? `https://www.stadt-koeln.de${p.link}` : PORTAL,
    roh: p, abgerufenAm: now,
  })
})

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return [c[0], c[1]]
}
function epochToDate(ms) {
  if (ms == null) return null
  const d = new Date(Number(ms))
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "koeln-verkehrsbeeintraechtigungen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Köln Verkehrsbeeinträchtigungen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Köln 50.9/6.9 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
