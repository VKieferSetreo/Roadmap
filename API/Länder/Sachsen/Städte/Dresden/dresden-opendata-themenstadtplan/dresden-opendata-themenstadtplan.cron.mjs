#!/usr/bin/env node
// Cron-Job: Dresden — Verkehrseinschränkungen (Themenstadtplan / kommisdd OGC API) — Quellen-ID 0213.
// Zieht den GESAMTEN Bestand aus L60 "aktuelle" + L150 "zukünftige" Verkehrseinschränkungen
// (OGC API Features / WFS3, GeoJSON EPSG:4326, LineString), mappt in unser obstacle-Format v1.0 und
// schreibt zur VERIFIKATION dresden-opendata-themenstadtplan.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node dresden-opendata-themenstadtplan.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0213"
const QUELLE_NAME = "Dresden — Verkehrseinschränkungen (Themenstadtplan, kommisdd OGC API)"
const PORTAL = "https://opendata.dresden.de/"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// OGC API Features (WFS3). L60 = aktuelle, L150 = zukünftige Verkehrseinschränkungen. GeoJSON 4326.
// Pagination via limit/offset (fetchAllFeatures ogcapi). Browser-UA für die Backend-Firewall.
const COLLECTIONS = [
  { id: "L60", label: "aktuell" },
  { id: "L150", label: "zukünftig" },
]
const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-cron/1.0)" } }

let verfuegbar = 0
const obstacles = []
for (const col of COLLECTIONS) {
  const base = `https://kommisdd.dresden.de/net4/public/ogcapi/collections/${col.id}/items?f=json`
  let feats = []
  try {
    feats = await fetchAllFeatures(base, { mode: "ogcapi", pageSize: 1000, maxPages: 10, timeoutMs: 60000, ...HEAD })
  } catch (e) {
    console.warn(`WARN ${col.id}: ${e.message}`)
    continue
  }
  verfuegbar += feats.length
  for (const f of feats) {
    const p = f.properties ?? {}
    const typ = String(p.typ ?? "")
    const grund = String(p.sperrgrund_format ?? "")
    const istVoll = /vollsperrung|gesperrt/i.test(typ) && !/halbseitig|fahrstreifen/i.test(typ)
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: `${col.id}-${p.staid ?? f.id}`,
      kategorie: istVoll ? "sperrung" : "baustelle", befristung: "temporaer",
      name: grund || typ || "Verkehrseinschränkung Dresden",
      beschreibung: [typ, grund].filter(Boolean).join(" — ").trim() || null,
      lat: refLat(f.geometry), lng: refLng(f.geometry),
      geom: f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString" ? stripCrs(f.geometry) : null,
      strassenRef: null,
      attrs: cleanAttrs({
        typ: typ || undefined,
        kategorie: p.kategorie ?? undefined,
        phase: col.label,
        vollsperrung: istVoll || undefined,
        restbreiteM: meterAusText(typ + " " + grund, /breite/i),
        maxGewichtT: tonnageAusText(typ + " " + grund),
      }),
      realerStart: dateOnly(p.datum_von_format ?? p.datum_von),
      gueltigVon: dateOnly(p.datum_von_format ?? p.datum_von),
      gueltigBis: dateOnly(p.datum_bis_format ?? p.datum_bis),
      quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
    }))
  }
  console.log(`  ${col.id} (${col.label}): ${feats.length} Features`)
}

function refLng(geom) { return ersterPunkt(geom)[0] }
function refLat(geom) { return ersterPunkt(geom)[1] }
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return [c[0], c[1]]
}
// Dresden liefert pro Geometrie ein inneres crs-Objekt — für sauberes GeoJSON entfernen.
function stripCrs(geom) { const { crs, ...rest } = geom; return rest }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "dresden-opendata-themenstadtplan", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`=== VERIFIKATION Dresden Verkehrseinschränkungen ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length} · mit geom: ${obstacles.filter((o) => o.geom).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Dresden 51.05/13.7 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
