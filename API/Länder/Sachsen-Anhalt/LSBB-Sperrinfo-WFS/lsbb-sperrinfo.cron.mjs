#!/usr/bin/env node
// Cron-Job: LSBB Sperrinfo Sachsen-Anhalt (SPERRINFOSYS ST) — Quellen-ID 0120.
// Zieht den GESAMTEN Bestand (Layer roadworks = Baustellen/Sperrungen/Verkehrsraumeinschränkungen),
// mappt ihn in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// lsbb-sperrinfo.normalisiert.json. Schreibt NICHT in die DB.
//
// WFS, outputFormat="application/json; subtype=geojson" → GeoJSON in EPSG:4326 nativ (keine
// Reprojektion). LineString-Geometrie, strukturierte Felder (kind, street, from_date, to_date,
// street_class, diversion). LIZENZ: "non-commercial only" — kommerziell nur mit Freigabe MLV/LSBB.
//
// Lauf:  node lsbb-sperrinfo.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, schreibeErgebnis, dateOnly, tonnageAusText, meterAusText } from "../../../_lib/format.mjs"

const QUELLE = "0120"
const QUELLE_NAME = "LSBB Sperrinfo Sachsen-Anhalt (SPERRINFOSYS ST)"
const HIER = dirname(fileURLToPath(import.meta.url))
const BASE = "https://service.ifak.eu/sperrinfo/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=roadworks"
const OUT = "&outputFormat=" + encodeURIComponent("application/json; subtype=geojson")
const now = new Date().toISOString()

// GESAMTER Bestand: count/startIndex-Pagination, GeoJSON EPSG:4326. ~168 roadworks.
const PAGE = 1000, MAX_PAGES = 5
const feats = []
for (let page = 0; page < MAX_PAGES; page++) {
  const data = await getJson(`${BASE}${OUT}&count=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs: 45000 })
  const fs = data.features ?? []
  feats.push(...fs)
  if (fs.length < PAGE) break
}
console.log(`ST-Sperrinfo (roadworks) verfügbar: ${feats.length}`)

// kind/kind_description → unsere kategorie
function katAus(p) {
  const k = String(p.kind ?? "").toUpperCase()
  const d = String(p.kind_description ?? "").toLowerCase()
  if (d.includes("sperr") || k === "S") return "sperrung"
  if (d.includes("einschränk") || k === "B") return "baustelle"
  return "baustelle"
}
// street_class (A/B/L/K/G) ist amtlich → direkt als Klasse-Hinweis nutzen; strassen_ref aus street.
function refAus(p) {
  const m = String(p.street ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  if (m) return `${m[1]}${m[2]}`
  if (p.bab_nr) { const b = String(p.bab_nr).match(/(\d+)/); if (b) return `A${b[1]}` }
  return null
}
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function lineGeom(geom) { const t = geom?.type; return t === "LineString" || t === "MultiLineString" ? geom : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const [lng, lat] = ersterPunkt(f.geometry)
  const text = [p.cause, p.kind_description].filter(Boolean).join(" — ")
  const tonnage = tonnageAusText(text)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.gid ?? p.feature_id ?? f.id,
    kategorie: tonnage ? "gewicht" : katAus(p), befristung: "temporaer",
    name: p.street || `Maßnahme ${p.location ?? ""}`,
    beschreibung: text || null,
    lat, lng, geom: lineGeom(f.geometry),
    strassenRef: refAus(p),
    attrs: cleanAttrs({
      kind: p.kind_description || undefined,
      streetClass: p.street_class || undefined,
      ort: p.location || undefined,
      maxGewichtT: tonnage ?? undefined,
      restbreiteM: meterAusText(text, /breite/i) ?? undefined,
      umleitung: (p.diversion && p.diversion.trim()) ? p.diversion.trim() : undefined,
    }),
    gueltigVon: dateOnly(p.from_date), gueltigBis: dateOnly(p.to_date), realerStart: dateOnly(p.from_date),
    quelleName: QUELLE_NAME, quelleUrl: "https://lsbb.sachsen-anhalt.de/service/baustellen-und-umleitungen",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "lsbb-sperrinfo", {
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
