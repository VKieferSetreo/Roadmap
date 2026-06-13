#!/usr/bin/env node
// Cron-Job: Düsseldorf — Verkehrsmeldungen (statisches GeoJSON, DATEX-II-Schema) — Quellen-ID 0217.
// Zieht die GESAMTE statische GeoJSON-Datei (Point, EPSG:4326, DATEX-II-Properties), mappt in unser
// obstacle-Format v1.0 und schreibt zur VERIFIKATION duesseldorf-verkehrsmeldungen.normalisiert.json.
// KEINE DB, NICHT die Engine.
// Lauf:  node duesseldorf-verkehrsmeldungen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, dateOnly, strassenklasseAusRef, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0217"
const QUELLE_NAME = "Düsseldorf — Verkehrsmeldungen (DATEX-II Mobilitätsdaten)"
const PORTAL = "https://opendata.duesseldorf.de/dataset/verkehrsmeldungen-mobilitätsdaten"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Eine statische, regelmäßig regenerierte GeoJSON-Datei → ein Voll-Abruf, keine Pagination.
const URL = "https://opendata.duesseldorf.de/sites/default/files/publ-2056000_Verkehrsmeldungen_Geodaten.geojson"
const data = await getJson(URL, { timeoutMs: 60000, headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-cron/1.0)" } })
const feats = data.features ?? []

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const recType = String(p.situationRecord_type ?? "")
  const constr = String(p.trafficConstrictionType ?? "")
  const mgmt = String(p.roadOrCarriagewayOrLaneManagementType ?? "")
  // DATEX-II-Enum → Kategorie: roadClosed/roadBlocked = sperrung, sonst baustelle.
  const istSperrung = /roadClosed|roadBlocked/i.test(mgmt) || /roadBlocked/i.test(constr)
  const vollsperrung = /roadClosed/i.test(mgmt) || (constr === "roadBlocked") || undefined
  const ref = p.roadNumber ? refAusNummer(p.roadNumber) : null
  return makeObstacle({
    quellenId: QUELLE,
    externeId: `${p.roadName ?? ""}-${p.overallStartTime ?? ""}-${f.geometry?.coordinates?.join(",")}`,
    kategorie: istSperrung ? "sperrung" : "baustelle",
    befristung: "temporaer",
    name: p.roadName ?? recType ?? "Verkehrsmeldung Düsseldorf",
    beschreibung: p.comment ?? null,
    lat: refLat(f.geometry), lng: refLng(f.geometry),
    richtung: "beide",
    strassenRef: ref,
    attrs: cleanAttrs({
      situationRecordType: recType || undefined,
      trafficConstrictionType: constr || undefined,
      managementType: mgmt || undefined,
      numberOfLanesRestricted: p.numberOfLanesRestricted ?? undefined,
      lane: p.lane || undefined,
      vollsperrung,
      restbreiteM: meterAusText(p.comment, /breite/i),
      maxHoeheM: meterAusText(p.comment, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(p.comment),
    }),
    realerStart: dateOnly(p.overallStartTime),
    gueltigVon: dateOnly(p.overallStartTime),
    gueltigBis: dateOnly(p.overallEndTime),
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
// roadNumber bei Düsseldorf ist eine interne Netz-ID (z.B. 1027) — keine A/B/L/K-Klasse → null.
function refAusNummer(n) {
  const s = String(n).trim().toUpperCase()
  return strassenklasseAusRef(s) !== "sonstige" ? s : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "duesseldorf-verkehrsmeldungen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Düsseldorf Verkehrsmeldungen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Düsseldorf 51.2/6.8 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
