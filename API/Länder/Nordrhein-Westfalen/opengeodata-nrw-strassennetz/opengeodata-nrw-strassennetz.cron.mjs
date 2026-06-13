#!/usr/bin/env node
// Cron-Job: OpenGeodata.NRW / Straßen.NRW — Bauwerke (Brücken/Tunnel) — Quellen-ID 0114.
// NUR der Bauwerke-Layer (ms:Bauwerke) — der Rest des WFS ist Straßennetz/Topologie (Netz → kein
// Cron). Liefert Brücken/Tunnel mit Geometrie + Stammdaten (BWNR, BWNAME, BW-Art, STRKL/STRNR),
// ABER keine Traglast/lichte Höhe (echte GST-Restriktion → gst-schwertransportkarte-nrw, 0113).
// Hier als dauerhafte Bauwerks-Hindernisse (befristung=dauerhaft). Der WFS liefert NUR GML 3.2
// (kein GeoJSON) → dependency-freier GML-Parser. SRSNAME=EPSG:4326 → <gml:pos> = "lat lon".
// Zieht den GESAMTEN Bestand (paginiert), schreibt opengeodata-nrw-strassennetz.normalisiert.json
// zur VERIFIKATION. KEINE DB, NICHT die Engine. Lauf: node opengeodata-nrw-strassennetz.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0125"
const QUELLE_NAME = "OpenGeodata.NRW / Straßen.NRW — Bauwerke (Brücken/Tunnel)"
const QUELLE_URL = "https://www.opengeodata.nrw.de/produkte/transport_verkehr/strassennetz/"
const WFS = "https://www.wfs.nrw.de/wfs/strassen_nrw"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand (live: numberMatched=19242 Bauwerke). Paging über COUNT/STARTINDEX.
// VERIFIKATION: maxPages=2 (≈4000 Bauwerke, <60 s). FÜR DEN VOLLEN BESTAND: maxPages=10 setzen.
const PAGE = 2000
const MAX_PAGES = 2 // voll: 10
// Nur diese BW-Arten sind echte Strecken-Hindernisse für GST (Lärmschutz/Stütz/Sonstiges raus):
const HINDERNIS_ARTEN = /brücke|tunnel|trog/i

async function ladeAlle() {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:Bauwerke` +
      `&SRSNAME=urn:ogc:def:crs:EPSG::4326&COUNT=${PAGE}&STARTINDEX=${page * PAGE}`
    const xml = await getText(url, { timeoutMs: 60000 })
    const members = xml.match(/<ms:Bauwerke\b[\s\S]*?<\/ms:Bauwerke>/g) ?? []
    all.push(...members)
    if (members.length < PAGE) break
  }
  return all
}

const members = await ladeAlle()
console.log(`Bauwerke geladen (Verifikations-Cap): ${members.length}`)

const obstacles = []
let verworfen = 0
for (const m of members) {
  const bw = tag(m, "BW") // "Brücke" / "Tunnel/Trogbauwerke" / "Stützbauwerk" / ...
  if (!bw || !HINDERNIS_ARTEN.test(bw)) { verworfen++; continue }
  const pos = tag(m, null, /<gml:pos>([^<]+)<\/gml:pos>/) // "lat lon" (EPSG:4326-Achsfolge)
  const [lat, lng] = pos ? pos.trim().split(/\s+/).map(Number) : [null, null]
  const kategorie = /tunnel|trog/i.test(bw) ? "tunnel" : "bruecke"
  const strkl = (tag(m, "STRKL") ?? "").trim()
  const strnr = (tag(m, "STRNR") ?? "").trim()
  const props = {
    BWNR: tag(m, "BWNR")?.trim(), BWNAME: dec(tag(m, "BWNAME")), BW: bw, BWART: tag(m, "BWART"),
    STRBEZ: tag(m, "STRBEZ"), STRKL: strkl, STRNR: strnr, ABSNR: tag(m, "ABSNR")?.trim(),
    ORT: tag(m, "ORT"), NETZSTAND: tag(m, "NETZSTAND"),
  }
  obstacles.push(makeObstacle({
    quellenId: QUELLE, externeId: props.BWNR,
    kategorie, befristung: "dauerhaft",
    name: props.BWNAME || `${bw} ${props.STRBEZ ?? ""}`.trim(),
    beschreibung: [props.BWART, props.ORT].filter(Boolean).join(", ") || null,
    lat, lng,
    strassenRef: strkl && strnr ? `${strkl.toUpperCase()}${strnr}` : (props.STRBEZ?.replace(/\s/g, "") ?? null),
    attrs: {}, // kein Traglast-/Höhenfeld im Bauwerke-Layer (s. Header)
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL, roh: props, abgerufenAm: now,
  }))
}

function tag(s, name, re) {
  const r = re ?? new RegExp(`<ms:${name}>([\\s\\S]*?)</ms:${name}>`)
  const m = s.match(r)
  return m ? m[1] : null
}
function dec(s) {
  return s == null ? null : s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || null
}

const erg = await schreibeErgebnis(HIER, "opengeodata-nrw-strassennetz", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: members.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`geladen: ${members.length} · davon Brücke/Tunnel normalisiert: ${obstacles.length} · verworfen (Lärmschutz/Stütz/…): ${verworfen}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
