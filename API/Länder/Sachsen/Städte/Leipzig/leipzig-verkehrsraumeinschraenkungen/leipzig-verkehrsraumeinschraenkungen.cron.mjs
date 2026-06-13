#!/usr/bin/env node
// Cron-Job: Leipzig — Verkehrsraumeinschränkungen (geodienste.leipzig.de) — Quellen-ID 0220.
// Zieht den GESAMTEN Bestand (WFS 2.0 GeoJSON, Punkt-Layer, ~1.556 Features, EPSG:25833),
// reprojiziert UTM33 → WGS84 (ZONE 33!), mappt in unser obstacle-Format v1.0 und schreibt zur
// VERIFIKATION leipzig-verkehrsraumeinschraenkungen.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node leipzig-verkehrsraumeinschraenkungen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0220"
const QUELLE_NAME = "Leipzig — Verkehrsraumeinschränkungen"
const PORTAL = "https://opendata.leipzig.de/dataset/verkehrsraumeinschrankungen-punkte-stadt-leipzig"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// WFS 2.0 GeoServer. ACHTUNG Layer-Casing: Punkte = "Verkehrsraumeinschraenkungen_point" (großes V).
// GeoJSON in EPSG:25833 (Zone 33!) → mit utmZuWgs84(e, n, 33) reprojizieren. Pagination count/startIndex.
const BASE =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:Verkehrsraumeinschraenkungen_point&outputFormat=application/json"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 3, timeoutMs: 60000 })
// maxPages=3 (≈3.000) deckt den ~1.556-Bestand voll ab; bei Wachstum erhöhen.

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunktUtm33(f.geometry)
  const sparte = String(p.sparte ?? "")
  const sperrart = String(p.sperrart ?? "")
  const text = [sparte, sperrart, p.meldung].filter(Boolean).join(" ")
  const vollsperrung = /vollsperrung|voll gesperrt/i.test(text) || undefined
  const istSperrung = /sperrung/i.test(sperrart)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.objectid ?? f.id,
    kategorie: istSperrung ? "sperrung" : "baustelle", befristung: "temporaer",
    name: (p.adresse ?? "").trim() || sparte || "Verkehrsraumeinschränkung Leipzig",
    beschreibung: [sparte, sperrart, p.meldung].filter((x) => x && x !== "keine Meldung").join(" — ").trim() || null,
    lat, lng,
    strassenRef: null,
    attrs: cleanAttrs({
      sparte: sparte || undefined,
      sperrart: sperrart || undefined,
      stadtbezirk: p.stadtbzrk ?? undefined,
      vollsperrung,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: dateOnly(p.beginn),
    gueltigVon: dateOnly(p.beginn),
    gueltigBis: dateOnly(p.ende),
    quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
  })
})

function ersterPunktUtm33(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 33)
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "leipzig-verkehrsraumeinschraenkungen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Leipzig Verkehrsraumeinschränkungen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Leipzig 51.34/12.37 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
