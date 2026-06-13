#!/usr/bin/env node
// Cron-Job: Straßenbaustellen Mecklenburg-Vorpommern (LS M-V / SBV) — Quellen-ID 0119.
// Zieht den GESAMTEN Bestand (Layer baustellen:Baustellen), mappt ihn in unser obstacle-Format
// v1.0 und schreibt zur VERIFIKATION baustellen-mv.normalisiert.json. Schreibt NICHT in die DB.
//
// WFS 2.0, outputFormat="application/json; subtype=geojson" → GeoJSON in EPSG:25833 (UTM Zone 33N!)
// → utmZuWgs84(e,n,33). Datum YYYY-MM-DD HH:MM:SS. erlaeuterung="Vollsperrung" o.ä. → Marker.
// LIZENZ-Hinweis: AccessConstraints "Urheberrecht" — kommerzielle Nutzung mit LS M-V klären.
//
// Lauf:  node baustellen-mv.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText } from "../../../_lib/format.mjs"

const QUELLE = "0119"
const QUELLE_NAME = "Straßenbaustellen Mecklenburg-Vorpommern (LS M-V / SBV)"
const HIER = dirname(fileURLToPath(import.meta.url))
const BASE = "https://www.geodaten-mv.de/dienste/wfs_baustellenmv?service=WFS&version=2.0.0&request=GetFeature&typeNames=baustellen:Baustellen"
const OUT = "&outputFormat=" + encodeURIComponent("application/json; subtype=geojson")
const now = new Date().toISOString()

// GESAMTER Bestand: count/startIndex-Pagination, GeoJSON. ~107 Baustellen.
const PAGE = 1000, MAX_PAGES = 5
const feats = []
for (let page = 0; page < MAX_PAGES; page++) {
  const data = await getJson(`${BASE}${OUT}&count=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs: 45000 })
  const fs = data.features ?? []
  feats.push(...fs)
  if (fs.length < PAGE) break
}
console.log(`MV-Baustellen verfügbar: ${feats.length}`)

// EPSG:25833 → erster Punkt nach Reprojektion (Zone 33) + ganze Linie reprojizieren.
function reproj(geom) {
  if (!geom) return { point: [null, null], line: null }
  const istUtm = (x) => Math.abs(x) > 1000
  const mapCoords = (c) => Array.isArray(c[0]) ? c.map(mapCoords) : (istUtm(c[0]) ? utmZuWgs84(c[0], c[1], 33) : c)
  const g = { ...geom, coordinates: mapCoords(geom.coordinates) }
  let c = g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  const line = (g.type === "LineString" || g.type === "MultiLineString") ? g : null
  return { point: [c?.[0] ?? null, c?.[1] ?? null], line }
}
function num(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null }
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const { point, line } = reproj(f.geometry)
  const text = [p.sperrart, p.erlaeuterung, p.verkehrslenkung, p.anderemassnahmen].filter(Boolean).join(" — ")
  const tonnage = tonnageAusText(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.gid ?? f.id ?? p.bsname,
    kategorie: tonnage ? "gewicht" : "baustelle", befristung: "temporaer",
    name: p.bsname || `Baustelle ${p.vonort ?? ""}`,
    beschreibung: text || null,
    lat: point[1], lng: point[0], geom: line,
    strassenRef: refAus(`${p.bsname ?? ""} ${p.vonort ?? ""}`),
    attrs: cleanAttrs({
      maxGewichtT: tonnage ?? undefined,
      restbreiteM: meterAusText(text, /breite/i) ?? undefined,
      sperrlaengeM: num(p.sperrlaenge) ?? undefined,
      vollsperrung: /vollsperr/i.test(`${p.erlaeuterung ?? ""}${p.sperrart ?? ""}`) || undefined,
      verkehrslenkung: p.verkehrslenkung || undefined,
    }),
    gueltigVon: dateOnly(p.baubeginn), gueltigBis: dateOnly(p.bauende), realerStart: dateOnly(p.baubeginn),
    quelleName: QUELLE_NAME, quelleUrl: "https://www.geoportal-mv.de/portal/Geowebdienste/Fachthemen/Verkehr",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "baustellen-mv", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`mit realer_start:`, obstacles.filter((o) => o.realer_start != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
