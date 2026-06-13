#!/usr/bin/env node
// Cron-Job: Umleitungsstrecken Schleswig-Holstein (LBV.SH / GDI-SH) — Quellen-ID 0118.
// Zieht den GESAMTEN Bestand (FeatureType Umleitungsstrecken, selber WFS wie SH-Baustellen),
// mappt ihn in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// umleitungsstrecken-sh.normalisiert.json. Schreibt NICHT in die DB.
//
// Fachlich: Umleitungsstrecken sind GST-relevant als Ausweichkorridore (analog HH-Bedarfsumleitungen).
// kategorie=sperrung-neutral mit Marker umleitung=true; LineString-Geometrie. EPSG:4326 nativ.
//
// Lauf:  node umleitungsstrecken-sh.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, fetchAllFeatures, schreibeErgebnis, dateOnly } from "../../../_lib/format.mjs"

const QUELLE = "0118"
const QUELLE_NAME = "Umleitungsstrecken Schleswig-Holstein (LBV.SH / GDI-SH)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: ArcGIS WFS 2.0, GeoJSON, EPSG:4326. ~173 Umleitungsstrecken.
const BASE = "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen?Service=WFS&Version=2.0.0&Request=GetFeature" +
  "&typeNames=Baustelleninformationen:Umleitungsstrecken&outputFormat=GEOJSON&srsName=EPSG:4326"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 3 })
console.log(`SH-Umleitungsstrecken verfügbar: ${feats.length}`)

function num(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null }
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function lineGeom(geom) { const t = geom?.type; return t === "LineString" || t === "MultiLineString" ? geom : null }
// "2026-05-18 - 2027-03-23" → {von, bis}
function gueltigkeit(s) {
  if (!s) return { von: null, bis: null }
  const t = String(s).split(/\s+-\s+/)
  return { von: dateOnly(t[0]), bis: dateOnly(t[1] ?? t[0]) }
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  const { von, bis } = gueltigkeit(p.GÜLTIGKEIT)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.OBJECTID ?? f.id,
    kategorie: "sperrung", befristung: "temporaer",
    name: `Umleitungsstrecke ${(p.STRECKENFÜHRUNG ?? "").slice(0, 60)}`.trim(),
    beschreibung: p.STRECKENFÜHRUNG || null,
    lat, lng, geom: lineGeom(f.geometry),
    attrs: cleanAttrs({
      umleitung: true,
      geeignetFuer: p.GEEIGNET_FÜR || undefined,
      mehrwegKm: num(p.Mehrweg_in_km) ?? undefined,
      zusatzzeitMin: num(p.ZUSÄTZLICHER_ZEITBEDARF_IN_MIN) ?? undefined,
    }),
    gueltigVon: von, gueltigBis: bis, realerStart: von,
    quelleName: QUELLE_NAME, quelleUrl: "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "umleitungsstrecken-sh", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
