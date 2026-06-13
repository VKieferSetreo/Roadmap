#!/usr/bin/env node
// Cron-Job: München — Baustellen (GeoPortal München, mor_wfs) — Quellen-ID 0210.
// Zieht den GESAMTEN Bestand (WFS 1.1.0 GeoJSON, ~5.880 Features, MultiPolygon, EPSG:25832),
// reprojiziert die Referenz-Koordinate UTM32 → WGS84, mappt in unser obstacle-Format v1.0 und
// schreibt zur VERIFIKATION muenchen-baustellen.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node muenchen-baustellen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0210"
const QUELLE_NAME = "München — Baustellen (GeoPortal München, mor_wfs)"
const PORTAL = "https://geoportal.muenchen.de/portal/opendata/"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// WFS 1.1.0 GeoServer: GeoJSON kommt in EPSG:25832 (UTM32), srsName wird beim GeoJSON-Output
// nicht zuverlässig honoriert → wir reprojizieren clientseitig. Pagination via startIndex.
const BASE =
  "https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0" +
  "&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json"

const PAGE = 1000
// maxPages=3 (≈3.000) hält die Verifikation <60s. Für den vollen Bestand (~5.880) maxPages erhöhen:
const MAX_PAGES = 3

const feats = []
for (let page = 0; page < MAX_PAGES; page++) {
  const data = await getJson(`${BASE}&maxFeatures=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs: 60000 })
  const f = data.features ?? []
  feats.push(...f)
  if (f.length < PAGE) break
}

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunktUtm32(f.geometry)
  const text = [p.beschreibung, p.beeintraechtigung, p.weitere_info].filter(Boolean).join(" ")
  const beeintr = String(p.beeintraechtigung ?? "")
  const vollsperrung = /vollsperr/i.test(beeintr) || /vollsperr/i.test(text) || undefined
  return makeObstacle({
    quellenId: QUELLE, externeId: p.fachliche_id ?? f.id, kategorie: "baustelle", befristung: "temporaer",
    name: p.strasse_hausnr ?? p.art ?? "Baustelle München",
    beschreibung: text.trim() || null,
    lat, lng,
    geom: f.geometry?.type?.includes("Polygon") || f.geometry?.type?.includes("LineString") ? f.geometry : null,
    strassenRef: null,
    attrs: cleanAttrs({
      art: p.art ?? undefined,
      betroffeneBereiche: p.betroffene_bereiche ?? undefined,
      beeintraechtigung: beeintr || undefined,
      vollsperrung,
      restbreiteM: meterAusText(text, /breite/i),
      maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
      maxGewichtT: tonnageAusText(text),
    }),
    realerStart: dateOnly(p.beginn_datum_kombiniert),
    gueltigVon: dateOnly(p.beginn_datum_kombiniert),
    gueltigBis: dateOnly(p.ende_datum_kombiniert),
    quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
  })
})

// Referenzpunkt = erste Koordinate der (Multi)Polygon-Geometrie, UTM32 (EPSG:25832) → WGS84.
function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "muenchen-baustellen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION München Baustellen ===`)
console.log(`verfügbar (gezogen): ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
const mitLatLng = obstacles.find((o) => o.lat != null)
if (mitLatLng) console.log(`Plausi lat/lng (sollte ~München 48.1/11.5 sein): ${mitLatLng.lat?.toFixed(4)}, ${mitLatLng.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
