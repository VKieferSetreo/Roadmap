#!/usr/bin/env node
// Cron-Job: Rostock — GST gesperrte Ingenieurbauwerke (OpenData.HRO) — Quellen-ID 0223.
// Zieht den GESAMTEN Bestand der für Großraum-/Schwertransporte (§34 StVZO) GESPERRTEN städtischen
// Ingenieurbauwerke (statisches GeoJSON, geo.sv.rostock.de, WGS84, Point). Das sind DAUERHAFTE
// Bauwerksrestriktionen (befristung=dauerhaft, attrs.grundsaetzlicheGstSperre=true). Mappt in unser
// obstacle-Format v1.0 und schreibt zur VERIFIKATION rostock-gst-routen.normalisiert.json.
// KEINE DB, NICHT die Engine.
// Lauf:  node rostock-gst-routen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0223"
const QUELLE_NAME = "Rostock — GST gesperrte Ingenieurbauwerke (OpenData.HRO)"
const PORTAL = "https://www.opendata-hro.de/dataset/grossraum_schwertransportrouten"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Statisches GeoJSON (CC0): städtische Ingenieurbauwerke OHNE Befahrungsmöglichkeit durch GST
// (für GST gesperrte Brücken/Bauwerke). Ein Voll-Abruf, keine Pagination.
const URL = "https://geo.sv.rostock.de/download/opendata/grossraum_schwertransportrouten/grossraum_schwertransportrouten_ingenieurbauwerke.json"
const data = await getJson(URL, { timeoutMs: 60000 })
const feats = data.features ?? []

// art → Kategorie: Brücke = bruecke; Stützwand/Lärmschutzwand etc. fachlich keine Brücke, aber als
// GST-gesperrtes Bauwerk eine dauerhafte Sperrung an dieser Stelle.
function kategorieAusArt(art) {
  const a = String(art ?? "").toLowerCase()
  if (a.includes("brücke") || a.includes("bruecke")) return "bruecke"
  if (a.includes("tunnel")) return "tunnel"
  return "sperrung"
}

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const kategorie = kategorieAusArt(p.art)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.uuid ?? p.bauwerksnummer ?? f.id,
    kategorie, befristung: "dauerhaft",
    name: [p.bauwerksnummer, p.bezeichnung].filter(Boolean).join(" — ") || "GST-gesperrtes Bauwerk Rostock",
    beschreibung: `Für Großraum-/Schwertransporte gesperrtes Bauwerk (§34 StVZO): ${p.art ?? ""} ${p.bezeichnung ?? ""}`.trim(),
    lat: refLat(f.geometry), lng: refLng(f.geometry),
    strassenRef: null,
    attrs: cleanAttrs({
      grundsaetzlicheGstSperre: true,
      bauwerksnummer: p.bauwerksnummer ?? undefined,
      art: p.art ?? undefined,
      bezeichnung: p.bezeichnung ?? undefined,
    }),
    realerStart: null, // dauerhaftes Bauwerk: kein "Start"-Datum aus der Quelle
    gueltigBis: null,   // unbefristet
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
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "rostock-gst-routen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`=== VERIFIKATION Rostock GST-gesperrte Bauwerke ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit grundsaetzlicheGstSperre:`, obstacles.filter((o) => o.attrs.grundsaetzlicheGstSperre).length)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Rostock 54.1/12.1 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
