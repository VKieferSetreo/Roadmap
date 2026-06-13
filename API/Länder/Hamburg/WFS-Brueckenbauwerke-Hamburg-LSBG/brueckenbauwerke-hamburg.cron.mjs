#!/usr/bin/env node
// Cron-Job: Brücken & Ingenieurbauwerke Hamburg (LSBG) — Quellen-ID 0111.
// Zieht den GESAMTEN Bauwerksbestand (Straßenbrücken, Tunnel, Verkehrszeichenbrücken),
// mappt ihn in unser obstacle-Format v1.0 (befristung=dauerhaft) und schreibt zur VERIFIKATION
// brueckenbauwerke-hamburg.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
//
// HINWEIS: Diese deegree-WFS-Instanz liefert application/geo+json UNZUVERLÄSSIG (0 Features trotz
// Daten). GML (text/xml; subtype=gml/3.2.1) ist der einzige robuste Weg → minimaler GML-Parser hier.
// Koordinaten kommen in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(e,n,32).
//
// Lauf:  node brueckenbauwerke-hamburg.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis, utmZuWgs84 } from "../../../_lib/format.mjs"

const QUELLE = "0111"
const QUELLE_NAME = "Brücken & Ingenieurbauwerke Hamburg (LSBG)"
const HIER = dirname(fileURLToPath(import.meta.url))
const BASE = "https://geodienste.hamburg.de/HH_WFS_Brueckenbauwerke"
const now = new Date().toISOString()

// FeatureTypes → unsere Kategorie. Nur hindernis-relevante Bauwerke (Lärmschutz/FG-Brücken = irrelevant).
const TYPEN = [
  { ft: "de.hh.up:strassenbruecken", kat: "bruecke" },
  { ft: "de.hh.up:tunnel", kat: "tunnel" },
  { ft: "de.hh.up:verkehrszeichenbruecken", kat: "ampel" }, // Schilderbrücke = Höhenrestriktion
]

// Minimaler GML-Parser für diese deegree-Ausgabe: featureMember-Blöcke + einfache <ns:tag>val</ns:tag>
// Felder + Punkt-Geometrie aus <gml:pos>E N</gml:pos>.
function parseGml(xml, ft) {
  const local = ft.split(":")[1]
  const out = []
  const re = new RegExp(`<de\\.hh\\.up:${local}\\b[^>]*>([\\s\\S]*?)</de\\.hh\\.up:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const props = {}
    const pre = new RegExp(`<de\\.hh\\.up:([a-z_0-9]+)>([^<]*)</de\\.hh\\.up:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) props[pm[1]] = pm[2].trim()
    const pos = block.match(/<gml:pos[^>]*>([\d.\-]+)\s+([\d.\-]+)<\/gml:pos>/)
    const e = pos ? Number(pos[1]) : null
    const n = pos ? Number(pos[2]) : null
    out.push({ props, e, n })
  }
  return out
}

function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }
function refAus(name) {
  const m = String(name ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

const obstacles = []
let verfuegbar = 0
for (const { ft, kat } of TYPEN) {
  // Voller Bestand via WFS 1.1.0 + maxFeatures (GML). count/startIndex auf dieser Instanz unzuverlässig
  // → maxFeatures hoch genug für gesamten Bestand. Für vollen Cron ggf. erhöhen.
  const url = `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${ft}` +
    `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
  let xml
  try { xml = await getText(url, { timeoutMs: 60000 }) } catch (e) { console.error(`${ft}: ${e.message}`); continue }
  const feats = parseGml(xml, ft)
  verfuegbar += feats.length
  console.log(`${ft}: ${feats.length} Bauwerke`)
  for (const { props, e, n } of feats) {
    const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: props.anzid ?? props.idnr ?? props.bauwerksnummer,
      kategorie: kat, befristung: "dauerhaft",
      name: (props.bauwerksname || `${kat} ${props.bauwerksnummer ?? ""}`).trim(),
      beschreibung: (props.bauwerksart || "").trim() || null,
      lat, lng, strassenRef: refAus(props.bauwerksname),
      attrs: cleanAttrs({
        bauwerksnummer: props.bauwerksnummer || undefined,
        asbNummer: props.anzid || undefined,
        baujahr: props.baujahr || undefined,
        bauwerksart: (props.bauwerksart || "").trim() || undefined,
      }),
      quelleName: QUELLE_NAME,
      quelleUrl: "https://metaver.de/trefferanzeige?docuuid=7534E0B7-F558-4F78-8417-32B24B011C48",
      roh: props, abgerufenAm: now,
    }))
  }
}

const erg = await schreibeErgebnis(HIER, "brueckenbauwerke-hamburg", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
