#!/usr/bin/env node
// Cron-Job: Karlsruhe / TRK — Baustellen (mobil.trk.de GeoServer) — Quellen-ID 0219.
// Zieht den GESAMTEN Bestand aus beiden Layern "aktuell" + "vorschau" (WFS GeoJSON, Point,
// EPSG:25832), reprojiziert UTM32 → WGS84, mappt in unser obstacle-Format v1.0 und schreibt zur
// VERIFIKATION karlsruhe-trk-baustellen.normalisiert.json. KEINE DB, NICHT die Engine.
// Regionaler Aggregator: Karlsruhe, Ettlingen, Rastatt, Baden-Baden, Bruchsal, Rheinstetten,
// Stutensee + Collectivité européenne d'Alsace (grenzüberschreitend).
// Lauf:  node karlsruhe-trk-baustellen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0219"
const QUELLE_NAME = "Karlsruhe / TRK — Baustellen (TechnologieRegion Karlsruhe)"
const PORTAL = "https://transparenz.karlsruhe.de/dataset/baustellen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// WFS 1.0.0 GeoServer (TBA). GeoJSON in EPSG:25832 → clientseitig reprojizieren. WFS 1.0.0 kennt
// kein zuverlässiges Offset → je Layer ein Voll-Request mit großem maxFeatures.
const WS = "https://mobil.trk.de/geoserver/TBA/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json"
const LAYERS = [
  { typ: "TBA:baustellen_aktuell", phase: "aktuell" },
  { typ: "TBA:baustellen_vorschau", phase: "vorschau" },
]

let verfuegbar = 0
const obstacles = []
for (const L of LAYERS) {
  let feats = []
  try {
    const data = await getJson(`${WS}&typeName=${encodeURIComponent(L.typ)}&maxFeatures=10000`, { timeoutMs: 60000 })
    feats = data.features ?? []
  } catch (e) {
    console.warn(`WARN ${L.phase}: ${e.message}`)
    continue
  }
  verfuegbar += feats.length
  for (const f of feats) {
    const p = f.properties ?? {}
    const [lng, lat] = ersterPunktUtm32(f.geometry)
    const text = [p.art, p.lage, p.zusatzinfo, p.sperrung].filter(Boolean).join(" ")
    const sperrung = String(p.sperrung ?? "")
    const vollsperrung = /vollsperrung|gesperrt|fermeture totale/i.test(text) || undefined
    const istSperrung = sperrung && /sperrung|gesperrt|fermeture/i.test(sperrung)
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: `${L.phase}-${p.id ?? f.id}`,
      kategorie: istSperrung ? "sperrung" : "baustelle", befristung: "temporaer",
      name: p.lage ?? p.art ?? "Baustelle TRK",
      beschreibung: [p.art, p.lage, p.zusatzinfo].filter(Boolean).join(" — ").replace(/<[^>]+>/g, " ").trim() || null,
      lat, lng,
      strassenRef: null,
      attrs: cleanAttrs({
        art: p.art ?? undefined,
        gemeinde: p.gemeinde ?? undefined,
        verursacher: p.verursacher ?? undefined,
        sperrung: sperrung || undefined,
        datenquelle: p.datenquelle ?? undefined,
        phase: L.phase,
        tagesbaustelle: p.tagesbaustelle ?? undefined,
        vollsperrung,
        restbreiteM: meterAusText(text, /breite/i),
        maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
        maxGewichtT: tonnageAusText(text),
      }),
      realerStart: dateOnly(p.vorgangszeitraum_von),
      gueltigVon: dateOnly(p.vorgangszeitraum_von),
      gueltigBis: dateOnly(p.vorgangszeitraum_bis),
      quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
    }))
  }
  console.log(`  ${L.phase}: ${feats.length} Features`)
}

function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "karlsruhe-trk-baustellen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`=== VERIFIKATION Karlsruhe/TRK Baustellen ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (Region KA ~48.6-49.0 / 7.7-8.6): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
