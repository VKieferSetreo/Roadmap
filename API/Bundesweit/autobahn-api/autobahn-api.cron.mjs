#!/usr/bin/env node
// Cron-Job: Autobahn-API (verkehr.autobahn.de) — Quellen-ID 0001.
// Zieht den GESAMTEN aktuellen Bestand (alle Autobahnen → Baustellen + Sperrungen),
// mappt ihn in unser obstacle-Format v1.0 und schreibt das Ergebnis zur VERIFIKATION
// nach autobahn-api.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
// Lauf:  node autobahn-api.cron.mjs       (für laufenden Cron-Betrieb wiederholbar)
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, dateOnly, tonnageAusText, meterAusText, schreibeErgebnis,
} from "../../_lib/format.mjs"

const QUELLE = "0001"
const QUELLE_NAME = "Autobahn-API (verkehr.autobahn.de)"
const BASE = "https://verkehr.autobahn.de/o/autobahn"
const HIER = dirname(fileURLToPath(import.meta.url))

async function mapMit(limit = 6, fn, items) {
  const out = []
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))))
  }
  return out
}

const now = new Date().toISOString()

// 1) GESAMTER Bestand: alle Autobahnen auflisten
const { roads } = await getJson(`${BASE}/`)
console.log(`Autobahnen verfügbar: ${roads.length}`)

// 2) je Autobahn: Baustellen + Sperrungen ziehen
const obstacles = []
let verfuegbar = 0

const proRoad = await mapMit(6, async (road) => {
  const res = { road, roadworks: [], closures: [] }
  try { res.roadworks = (await getJson(`${BASE}/${road}/services/roadworks`)).roadworks ?? [] } catch {}
  try { res.closures = (await getJson(`${BASE}/${road}/services/closure`)).closure ?? [] } catch {}
  return res
}, roads)

for (const { road, roadworks, closures } of proRoad) {
  verfuegbar += roadworks.length + closures.length
  for (const r of roadworks) {
    const c = r.coordinate ?? {}
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: r.identifier, kategorie: "baustelle", befristung: "temporaer",
      name: r.title ?? `Baustelle ${road}`, beschreibung: (r.description ?? []).join(" ").trim() || null,
      lat: c.lat, lng: c.long, strassenRef: road,
      attrs: cleanAttrs({ restbreiteM: meterAusText((r.description ?? []).join(" "), /breite/i) }),
      realerStart: dateOnly(r.startTimestamp), quelleName: QUELLE_NAME,
      quelleUrl: `https://verkehr.autobahn.de`, roh: r, abgerufenAm: now,
    }))
  }
  for (const cl of closures) {
    const c = cl.coordinate ?? {}
    const dt = String(cl.display_type ?? "")
    const text = (cl.description ?? []).join(" ")
    const tonnage = dt.startsWith("WEIGHT_LIMIT") ? (tonnageAusText(dt.replace("_", " ")) ?? tonnageAusText(text)) : tonnageAusText(text)
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: cl.identifier, kategorie: tonnage ? "gewicht" : "sperrung",
      befristung: "temporaer", name: cl.title ?? `Sperrung ${road}`, beschreibung: text.trim() || null,
      lat: c.lat, lng: c.long, strassenRef: road,
      attrs: cleanAttrs({ maxGewichtT: tonnage, vollsperrung: dt === "CLOSURE" || undefined }),
      realerStart: dateOnly(cl.startTimestamp), quelleName: QUELLE_NAME,
      quelleUrl: `https://verkehr.autobahn.de`, roh: cl, abgerufenAm: now,
    }))
  }
}

function cleanAttrs(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))
}

// 3) Ergebnis im Roadmap-Format ausgeben (Verifikation — KEINE DB)
const erg = await schreibeErgebnis(HIER, "autobahn-api", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar gesamt: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit Gewichtslimit (attrs.maxGewichtT):`, obstacles.filter((o) => o.attrs.maxGewichtT != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
