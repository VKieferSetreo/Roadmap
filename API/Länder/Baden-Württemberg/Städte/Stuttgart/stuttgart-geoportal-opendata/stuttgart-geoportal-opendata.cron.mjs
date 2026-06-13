#!/usr/bin/env node
// Cron-Job: Stuttgart — Baustellen (Open Data Stuttgart / geoserver.stuttgart.de) — Quellen-ID 0214.
// Zieht den GESAMTEN Bestand aus beiden Layern "im_Bau" (aktuell) + "geplant" (WFS 2.0 GeoJSON,
// Point, EPSG:25832), reprojiziert UTM32 → WGS84, mappt in unser obstacle-Format v1.0 und schreibt
// zur VERIFIKATION stuttgart-geoportal-opendata.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node stuttgart-geoportal-opendata.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0214"
const QUELLE_NAME = "Stuttgart — Baustellen (Open Data Stuttgart, geoserver.stuttgart.de)"
const PORTAL = "https://opendata.stuttgart.de/dataset/baustellen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

const WS = "https://geoserver.stuttgart.de/gdc/Verkehr_Mobilitaet/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json"
const LAYERS = [
  { typ: "Verkehr_Mobilitaet:A66_BAUM_BAUSTELLEN_DATE_WEB_im_Bau_EPSG25832", phase: "im Bau" },
  { typ: "Verkehr_Mobilitaet:A66_BAUM_BAUSTELLEN_DATE_WEB_geplant_EPSG25832", phase: "geplant" },
]
const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-cron/1.0)" } }

let verfuegbar = 0
const obstacles = []
for (const L of LAYERS) {
  const base = `${WS}&typeNames=${encodeURIComponent(L.typ)}`
  let feats = []
  try {
    feats = await fetchAllFeatures(base, { mode: "wfs2", pageSize: 1000, maxPages: 5, timeoutMs: 60000, ...HEAD })
  } catch (e) {
    console.warn(`WARN ${L.phase}: ${e.message}`)
    continue
  }
  verfuegbar += feats.length
  for (const f of feats) {
    const p = f.properties ?? {}
    const [lng, lat] = ersterPunktUtm32(f.geometry, p)
    const text = [p.ART_ARBEIT, p.VERKEHRSAUSWIRKUNG, p.DETAILS_STANDORT].filter(Boolean).join(" ")
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: f.id, kategorie: "baustelle", befristung: "temporaer",
      name: p.STRASSENNAME ?? p.ART_ARBEIT ?? "Baustelle Stuttgart",
      beschreibung: [p.ART_ARBEIT, p.VERKEHRSAUSWIRKUNG].filter(Boolean).join(" — ").trim() || null,
      lat, lng,
      strassenRef: null,
      attrs: cleanAttrs({
        detailsStandort: p.DETAILS_STANDORT ?? undefined,
        zeitlicheRegelung: p.ZEITL_REGELUNG ?? undefined,
        status: p.STATUS ?? undefined,
        phase: L.phase,
        vollsperrung: /vollsperr|gesperrt/i.test(text) || undefined,
        restbreiteM: meterAusText(text, /breite/i),
        maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
        maxGewichtT: tonnageAusText(text),
      }),
      realerStart: dateOnly(p.ANFANG),
      gueltigVon: dateOnly(p.ANFANG),
      gueltigBis: dateOnly(p.ENDE), // ENDE teils Freitext ("Ende Dez. 2029") → dann null
      quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
    }))
  }
  console.log(`  ${L.phase}: ${feats.length} Features`)
}

// Stuttgart hat KOORDINATE_X/Y als Strings + Point-Geometrie in EPSG:25832 → reprojizieren.
function ersterPunktUtm32(geom, p) {
  let e, n
  if (geom?.coordinates) {
    let c = geom.coordinates
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
    if (Array.isArray(c) && c.length >= 2) { e = c[0]; n = c[1] }
  }
  if (e == null && p?.KOORDINATE_X) { e = Number(p.KOORDINATE_X); n = Number(p.KOORDINATE_Y) }
  if (!Number.isFinite(e) || !Number.isFinite(n)) return [null, null]
  return utmZuWgs84(e, n, 32)
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "stuttgart-geoportal-opendata", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`=== VERIFIKATION Stuttgart Baustellen ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Stuttgart 48.78/9.18 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
