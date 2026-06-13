#!/usr/bin/env node
// Cron-Job: Aachen — Baustellen (BSIS, bsis.aachen.de GeoServer) — Quellen-ID 0211.
// Zieht den GESAMTEN Bestand (WFS 2.0 GeoJSON, ~407 Baustellen, MultiPoint, EPSG:25832),
// reprojiziert UTM32 → WGS84, mappt in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// aachen-baustellen-ckan.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node aachen-baustellen-ckan.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0211"
const QUELLE_NAME = "Aachen — Baustellen (BSIS, Baustellen-Informationssystem)"
const PORTAL = "https://offenedaten.aachen.de/dataset/baustellen-stadtgebiet-aachen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// WFS 2.0 GeoServer, Layer BSIS:PUNKTE_ALLE. GeoJSON kommt in EPSG:25832 → clientseitig
// reprojizieren. Pagination via count/startIndex (fetchAllFeatures wfs2). Voller Bestand klein (~407).
const BASE =
  "https://bsis.aachen.de/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=BSIS:PUNKTE_ALLE&outputFormat=application/json"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 5, timeoutMs: 60000 })

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunktUtm32(f.geometry)
  const text = [p.beschreibu, p.einschraen, p.name].filter(Boolean).join(" ")
  const vollsperrung = /vollsperr/i.test(text) || undefined
  return makeObstacle({
    quellenId: QUELLE, externeId: p.gid ?? p.sdatenid ?? f.id, kategorie: "baustelle", befristung: "temporaer",
    name: p.name ?? p.art ?? "Baustelle Aachen",
    beschreibung: [p.beschreibu, p.einschraen].filter(Boolean).join(" — ").trim() || null,
    lat, lng,
    strassenRef: null,
    attrs: cleanAttrs({
      strasse: p.strassen ?? undefined,
      bereich: p.bereich ?? undefined,
      art: p.art ?? undefined,
      firma: p.firma ?? undefined,
      bauherr: p.bauherr ?? undefined,
      vollsperrung,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: dateOnly(p.von),
    gueltigVon: dateOnly(p.von),
    gueltigBis: dateOnly(p.bis),
    quelleName: QUELLE_NAME, quelleUrl: p.hotlink ?? PORTAL, roh: p, abgerufenAm: now,
  })
})

function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "aachen-baustellen-ckan", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Aachen Baustellen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Aachen 50.77/6.08 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
