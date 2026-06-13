#!/usr/bin/env node
// Cron-Job: Baustellen Hamburg (stadtweit, BVM/LGV) — Quellen-ID 0112.
// Zieht den GESAMTEN Baustellen-Bestand ("Bauweiser", bis ~50 größte + weitere), mappt ihn in
// unser obstacle-Format v1.0 (befristung=temporaer) und schreibt zur VERIFIKATION
// baustellen-hamburg.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
//
// HINWEIS: deegree-WFS liefert application/geo+json UNZUVERLÄSSIG (0 Features) → GML-Parsing.
// Punkt-Geometrie in EPSG:25832 → utmZuWgs84(e,n,32). Datumsfelder sind DD.MM.YYYY.
//
// Lauf:  node baustellen-hamburg.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis, utmZuWgs84, dateOnly, meterAusText } from "../../../_lib/format.mjs"

const QUELLE = "0112"
const QUELLE_NAME = "Baustellen Hamburg (stadtweit, BVM/LGV)"
const HIER = dirname(fileURLToPath(import.meta.url))
const BASE = "https://geodienste.hamburg.de/hh_wfs_baustellen" // ACHTUNG: lowercase
const now = new Date().toISOString()

// Voller Bestand via WFS 1.1.0 + maxFeatures (GML). count/startIndex hier unzuverlässig.
const url = `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=de.hh.up:baustelle` +
  `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
const xml = await getText(url, { timeoutMs: 60000 })

// Minimaler GML-Parser: featureMember-Blöcke → Felder + Punkt aus <gml:pos>E N</gml:pos>.
function parseGml(xml, local, ns) {
  const out = []
  const re = new RegExp(`<${ns}:${local}\\b[^>]*gml:id="([^"]*)"[^>]*>([\\s\\S]*?)</${ns}:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const gmlId = m[1], block = m[2]
    const props = {}
    const pre = new RegExp(`<${ns}:([a-z_0-9]+)>([^<]*)</${ns}:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) if (!(pm[1] in props)) props[pm[1]] = pm[2].trim()
    const pos = block.match(/<gml:pos[^>]*>([\d.\-]+)\s+([\d.\-]+)<\/gml:pos>/)
    out.push({ gmlId, props, e: pos ? Number(pos[1]) : null, n: pos ? Number(pos[2]) : null })
  }
  return out
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const feats = parseGml(xml, "baustelle", "de.hh.up")
console.log(`Baustellen verfügbar: ${feats.length}`)

const obstacles = feats.map(({ gmlId, props: p, e, n }) => {
  const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
  const text = [p.umfang, p.anlass].filter(Boolean).join(" — ")
  return makeObstacle({
    quellenId: QUELLE, externeId: gmlId,
    kategorie: "baustelle", befristung: "temporaer",
    name: p.titel || "Baustelle Hamburg",
    beschreibung: text || null,
    lat, lng,
    attrs: cleanAttrs({
      restbreiteM: meterAusText(p.umfang, /breite/i) ?? undefined,
      vollsperrung: p.iststoerung === "true" ? true : undefined,
    }),
    realerStart: dateOnly(p.baubeginn),
    gueltigVon: dateOnly(p.baubeginn),
    gueltigBis: dateOnly(p.bauende),
    quelleName: QUELLE_NAME,
    quelleUrl: "https://suche.transparenz.hamburg.de/dataset/baustellen-hamburg",
    roh: p, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "baustellen-hamburg", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit realer_start:`, obstacles.filter((o) => o.realer_start != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
