#!/usr/bin/env node
// Cron-Job: Detailnetz Berlin — Ingenieurbauwerke (Brücken, Tunnel) — Quellen-ID 0116.
// Zieht den GESAMTEN Bauwerksbestand (Layer detailnetz:b_bauwerke), mappt ihn in unser
// obstacle-Format v1.0 (befristung=dauerhaft) und schreibt zur VERIFIKATION
// detailnetz-berlin-bauwerke.normalisiert.json. Schreibt NICHT in die DB.
//
// Neuer gdi.berlin.de-Host (FIS-Broker abgeschaltet 01.12.2025). outputFormat=application/json
// liefert GeoJSON in EPSG:25833 (UTM Zone 33N!) → utmZuWgs84(e,n,33). NUR Geometrie/Identität,
// KEINE Traglast/Brückenklasse (die kommt via SIB-Join). bauwerksart: BR=Brücke, TU=Tunnel.
//
// Lauf:  node detailnetz-berlin-bauwerke.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, fetchAllFeatures, schreibeErgebnis, utmZuWgs84 } from "../../../_lib/format.mjs"

const QUELLE = "0116"
const QUELLE_NAME = "Detailnetz Berlin — Ingenieurbauwerke (Brücken/Tunnel)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: GeoServer WFS 2.0, GeoJSON, EPSG:25833 (Zone 33). 1005 Bauwerke total.
const BASE = "https://gdi.berlin.de/services/wfs/detailnetz?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=detailnetz:b_bauwerke&outputFormat=application/json"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 5 })
console.log(`Detailnetz-Bauwerke verfügbar: ${feats.length}`)

// bauwerksart (BR/TU/...) → unsere Kategorie. Default bruecke (Detailnetz ist Brücken/Tunnel).
function katAus(art) {
  const s = String(art ?? "").toUpperCase()
  if (s.startsWith("TU")) return "tunnel"
  if (s.startsWith("BR") || s.startsWith("UF") || s.startsWith("UE")) return "bruecke"
  return "bruecke"
}
// EPSG:25833 → erster Punkt nach Reprojektion (Zone 33).
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (c == null) return [null, null]
  // Werte > 1000 = UTM-Easting → reprojizieren Zone 33
  return Math.abs(c[0]) > 1000 ? utmZuWgs84(c[0], c[1], 33) : [c[0], c[1]]
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  return makeObstacle({
    quellenId: QUELLE,
    externeId: p.dnbr__sdatenid ?? p.bauwerksnummer ?? f.id,
    kategorie: katAus(p.bauwerksart), befristung: "dauerhaft",
    name: p.bauwerksname || `Bauwerk ${p.bauwerksnummer ?? f.id}`,
    beschreibung: null,
    lat, lng,
    geom: f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString" ? null : null, // Geometrie ist UTM → roh in p
    strassenRef: refAus(p.bauwerksname),
    attrs: cleanAttrs({
      bauwerksart: p.bauwerksart || undefined,
      bauwerksnummer: p.bauwerksnummer || undefined,
      sibBauwerksnummer: (p.sib_bauwerksnummer && p.sib_bauwerksnummer !== "-") ? p.sib_bauwerksnummer : undefined,
      okstraId: p.okstra_id || undefined,
    }),
    quelleName: QUELLE_NAME, quelleUrl: "https://daten.berlin.de/datensaetze/detailnetz-bauwerke-wfs",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "detailnetz-berlin-bauwerke", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit SIB-Nr (Join BASt):`, obstacles.filter((o) => o.attrs.sibBauwerksnummer != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
