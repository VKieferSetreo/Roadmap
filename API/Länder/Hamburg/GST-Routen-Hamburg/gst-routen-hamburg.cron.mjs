#!/usr/bin/env node
// Cron-Job: GST-Routen Hamburg (Großraum-/Schwertransport-Netz) — Quellen-ID 0110.
// Zieht den GESAMTEN GST-Netz-Bestand (OGC API Features, GeoJSON, EPSG:4326, ~3892 Features),
// mappt ihn in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// gst-routen-hamburg.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
//
// Fachlich: Das GST-Netz sind die für Großraum-/Schwertransporte zugelassenen Vorzugsrouten
// in/durch Hamburg (Stütze für VEMAGS-Anträge). Es ist KEIN klassisches Netzdaten-Feature,
// sondern ein GST-relevanter Producer: jede Kante ist eine befahrbare/gewidmete GST-Strecke.
// Wir mappen sie als befristung=dauerhaft mit kategorie=sperrung-neutral → als "gst_route"-Marker
// in attrs, damit die Engine das GST-Netz als Positiv-Korridor nutzen kann.
//
// Lauf:  node gst-routen-hamburg.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0110"
const QUELLE_NAME = "GST-Routen Hamburg (Großraum-/Schwertransport-Netz, LBV/LGV)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: OGC API Features GeoJSON (sauberster Weg; WFS-deegree count= ist hier flaky).
// Liefert WGS84 (EPSG:4326), keine Reprojektion nötig.
const COLL = "https://api.hamburg.de/datasets/v1/grossraum_und_schwertransport_routen" +
  "/collections/grossraum_schwertransport_netz/items"

// Volle Pagination: limit=1000, offset hochzählen bis numberReturned < limit.
// maxPages cappt die Verifikation (<60s). Für vollen Cron-Betrieb maxPages erhöhen (4 reicht: 3892/1000).
const LIMIT = 1000
const MAX_PAGES = 5
const feats = []
let numberMatched = null
for (let page = 0; page < MAX_PAGES; page++) {
  const data = await getJson(`${COLL}?f=json&limit=${LIMIT}&offset=${page * LIMIT}`, { timeoutMs: 45000 })
  numberMatched = data.numberMatched ?? numberMatched
  const fs = data.features ?? []
  feats.push(...fs)
  if (fs.length < LIMIT) break
}
console.log(`GST-Netz-Kanten verfügbar: ${numberMatched ?? feats.length} · gezogen: ${feats.length}`)

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function lineGeom(geom) {
  const t = geom?.type
  return t === "LineString" || t === "MultiLineString" ? geom : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

// strassen_ref aus strassenname/wegenummer ziehen (z.B. "BAB A253 abgestuft zur B 75" → A253).
function refAus(p) {
  const s = `${p.strassenname ?? ""} ${p.wegenummer ?? ""}`
  const m = s.match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  return makeObstacle({
    quellenId: QUELLE,
    externeId: f.id,
    kategorie: "sperrung",           // neutraler Träger; gst_route-Marker in attrs (Positiv-Korridor)
    befristung: "dauerhaft",         // GST-Netz ist ein gepflegter Dauerbestand, kein Ereignis
    name: p.strassenname ?? `GST-Route ${p.wegenummer ?? f.id}`,
    beschreibung: cleanAttrs({ wegeart: p.wegeart, geschwindigkeit: p.geschwindigkeit }).wegeart
      ? `${p.wegeart}${p.geschwindigkeit ? ` · ${p.geschwindigkeit}` : ""}` : null,
    lat, lng,
    geom: lineGeom(f.geometry),
    richtung: p.richtung === "in Stationierungsrichtung" ? "hin"
      : p.richtung === "gegen Stationierungsrichtung" ? "rueck" : "beide",
    strassenRef: refAus(p),
    attrs: cleanAttrs({
      gstRoute: true,
      wegenummer: p.wegenummer,
      fahrstreifen: p.fahrstreifenanzahl_in_stationierungsrichtung ?? undefined,
    }),
    quelleName: QUELLE_NAME,
    quelleUrl: "https://suche.transparenz.hamburg.de/dataset/grossraum-und-schwertransport-routen-in-hamburg12",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "gst-routen-hamburg", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: numberMatched ?? feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${numberMatched ?? feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`mit strassen_ref:`, obstacles.filter((o) => o.strassen_ref != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
