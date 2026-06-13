#!/usr/bin/env node
// Cron-Job: Bonn — Baustellen (stadtplan.bonn.de GeoJSON ?Thema=) — Quellen-ID 0218.
// Zieht den GESAMTEN Bestand (tagesaktuelle Baustellen, Thema=14403, GeoJSON Point EPSG:4326),
// mappt in unser obstacle-Format v1.0 und schreibt zur VERIFIKATION
// bonn-baustellen-stadtplan.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node bonn-baustellen-stadtplan.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, dateOnly, strassenklasseAusRef,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0218"
const QUELLE_NAME = "Bonn — Baustellen (stadtplan.bonn.de)"
const PORTAL = "https://opengeodata-bonn.de/baustellen-tagesaktuell-mit-ortsangabe-bonn/"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Einfaches ?Thema=<id>-GeoJSON-Muster, ganzer Datensatz in einem Abruf (keine Pagination).
// 14403 = tagesaktuelle Baustellen. (Geplante Baustellen liegen unter eigenem Thema-Param.)
const URL = "https://stadtplan.bonn.de/geojson?Thema=14403"
const data = await getJson(URL, { timeoutMs: 60000, headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-cron/1.0)" } })
const feats = data.features ?? []

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const sperrung = String(p.sperrung ?? "")
  const vollsperrung = /vollsperrung/i.test(sperrung) || undefined
  const istSperrung = /sperrung/i.test(sperrung)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.baustelle_id ?? f.id,
    kategorie: istSperrung ? "sperrung" : "baustelle", befristung: "temporaer",
    name: p.bezeichnung ?? p.adresse ?? "Baustelle Bonn",
    beschreibung: [p.massnahme, p.sperrung, p.adresse].filter(Boolean).join(" — ").trim() || null,
    lat: refLat(f.geometry), lng: refLng(f.geometry),
    strassenRef: refAusBezeichnung(p.bezeichnung),
    attrs: cleanAttrs({
      massnahme: p.massnahme ?? undefined,
      sperrung: sperrung || undefined,
      vollsperrung,
      traeger: p.traeger ?? undefined,
      stadtbezirk: p.stadtbezirk_bez ?? undefined,
      adresse: p.adresse ?? undefined,
    }),
    realerStart: dateOnly(p.von),
    gueltigVon: dateOnly(p.von),
    gueltigBis: dateOnly(p.bis),
    quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
  })
})

function refLng(geom) { return ersterPunkt(geom)[0] }
function refLat(geom) { return ersterPunkt(geom)[1] }
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return [c[0], c[1]]
}
// "Hermann-Wandersleb-Ring (B56)" → "B56"
function refAusBezeichnung(b) {
  const m = String(b ?? "").match(/\b([ABLK]\s?\d{1,4})\b/)
  if (!m) return null
  const ref = m[1].replace(/\s/, "")
  return strassenklasseAusRef(ref) !== "sonstige" ? ref : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "bonn-baustellen-stadtplan", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Bonn Baustellen ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Bonn 50.7/7.1 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
