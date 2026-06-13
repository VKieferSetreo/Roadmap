#!/usr/bin/env node
// Cron-Job: Straßenbaustellen Schleswig-Holstein (LBV.SH / GDI-SH) — Quellen-ID 0117.
// Zieht den GESAMTEN Bestand (FeatureType Baustellen_SH), mappt ihn in unser obstacle-Format
// v1.0 und schreibt zur VERIFIKATION baustellen-sh.normalisiert.json. Schreibt NICHT in die DB.
//
// ArcGIS-WFS, outputFormat=GEOJSON → sauberes GeoJSON in EPSG:4326 (keine Reprojektion),
// count/startIndex-Pagination funktioniert. Strukturierte Grenzwerte: Gewichtsbeschränkung_in_t,
// Verbleibende_Restbreite_in_m, Länge_in_m. Datum im Freitext "von bis" → dateOnly greift.
//
// Lauf:  node baustellen-sh.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, fetchAllFeatures, schreibeErgebnis, dateOnly } from "../../../_lib/format.mjs"

const QUELLE = "0117"
const QUELLE_NAME = "Straßenbaustellen Schleswig-Holstein (LBV.SH / GDI-SH)"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: ArcGIS WFS 2.0, GeoJSON, EPSG:4326 nativ. ~1137 Baustellen.
const BASE = "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen?Service=WFS&Version=2.0.0&Request=GetFeature" +
  "&typeNames=Baustelleninformationen:Baustellen_SH&outputFormat=GEOJSON&srsName=EPSG:4326"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 5 })
console.log(`SH-Baustellen verfügbar: ${feats.length}`)

function num(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null }
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function lineGeom(geom) { const t = geom?.type; return t === "LineString" || t === "MultiLineString" ? geom : null }
// "2026-03-02 23:00:00 bis 2027-11-12 22:59:00" → {von, bis}
function dauer(s) {
  if (!s) return { von: null, bis: null }
  const teile = String(s).split(/\s+bis\s+/i)
  return { von: dateOnly(teile[0]), bis: dateOnly(teile[1] ?? teile[0]) }
}
function richtungAus(r) {
  const s = String(r ?? "").toLowerCase()
  if (s.includes("inerfassung") || s.includes("stationierung")) return "hin"
  if (s.includes("gegen")) return "rueck"
  return "beide"
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  const { von, bis } = dauer(p.Dauer_der_Bauphase)
  const gewicht = num(p.Gewichtsbeschränkung_in_t)
  const text = [p.Verkehrseinschränkung, p.Art_der_Maßnahme, p.Hinweise_zur_Verkehrsführung].filter(Boolean).join(" — ")
  return makeObstacle({
    quellenId: QUELLE, externeId: p.OBJECTID ?? f.id,
    kategorie: gewicht ? "gewicht" : "baustelle", befristung: "temporaer",
    name: `Baustelle ${p.Straßenname ?? ""} (${p.Art_der_Maßnahme ?? "Bauarbeiten"})`.trim(),
    beschreibung: text || null,
    lat, lng, geom: lineGeom(f.geometry),
    richtung: richtungAus(p.Betroffene_Fahrtrichtung),
    strassenRef: refAus(p.Straßenname) ?? (p.Straßenname || null),
    attrs: cleanAttrs({
      restbreiteM: num(p.Verbleibende_Restbreite_in_m) ?? undefined,
      maxGewichtT: gewicht ?? undefined,
      laengeM: num(p.Länge_in_m) ?? undefined,
      verkehrseinschraenkung: p.Verkehrseinschränkung || undefined,
      vollsperrung: /vollsperr|gesperrt|durchgangsverkehr.*gesperrt/i.test(text) || undefined,
      umleitung: (p.Umleitungsempfehlung && !/keine beschreibung/i.test(p.Umleitungsempfehlung)) ? p.Umleitungsempfehlung : undefined,
    }),
    gueltigVon: von, gueltigBis: bis, realerStart: von,
    quelleName: QUELLE_NAME, quelleUrl: "https://www.govdata.de/daten/-/details/strassenbaustellen-schleswig-holsteinf229d",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "baustellen-sh", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit Linien-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`mit Gewichtslimit:`, obstacles.filter((o) => o.attrs.maxGewichtT != null).length)
console.log(`mit Restbreite:`, obstacles.filter((o) => o.attrs.restbreiteM != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
