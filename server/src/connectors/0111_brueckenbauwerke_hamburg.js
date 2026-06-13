// Connector Quelle 0111: Brücken & Ingenieurbauwerke Hamburg (LSBG).
// Port aus API/Länder/Hamburg/WFS-Brueckenbauwerke-Hamburg-LSBG/brueckenbauwerke-hamburg.cron.mjs.
// Straßenbrücken, Tunnel, Verkehrszeichenbrücken. deegree geo+json unzuverlässig → GML-Parsing
// (WFS 1.1.0, je FeatureType ein Request). Punkt in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(e,n,32).

import { makeNormalized, getText, utmZuWgs84, num } from "./_helpers.js"

const QUELLE_NAME = "Brücken & Ingenieurbauwerke Hamburg (LSBG)"
const QUELLE_URL = "https://metaver.de/trefferanzeige?docuuid=7534E0B7-F558-4F78-8417-32B24B011C48"
const BASE = "https://geodienste.hamburg.de/HH_WFS_Brueckenbauwerke"
const TYPEN = [
  { ft: "de.hh.up:strassenbruecken", kat: "bruecke" },
  { ft: "de.hh.up:tunnel", kat: "tunnel" },
  { ft: "de.hh.up:verkehrszeichenbruecken", kat: "ampel" }, // Schilderbrücke = Höhenrestriktion
]

function parseGml(xml, ft) {
  if (!xml) return []
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
function refAus(name) {
  const m = String(name ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

export const brueckenbauwerkeHamburgConnector = {
  quelleId: "0111",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    for (const { ft, kat } of TYPEN) {
      const url =
        `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${ft}` +
        `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
      const xml = await getText(url, { timeoutMs })
      const feats = parseGml(xml, ft)
      log(`${ft}: ${feats.length} Bauwerke`)
      for (const { props, e, n } of feats) {
        const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
        obstacles.push(makeNormalized({
          externeId: props.anzid ?? props.idnr ?? props.bauwerksnummer,
          kategorie: kat,
          name: (props.bauwerksname || `${kat} ${props.bauwerksnummer ?? ""}`).trim(),
          beschreibung: (props.bauwerksart || "").trim() || null,
          lat, lng,
          strassenRef: refAus(props.bauwerksname),
          attrs: { baujahr: num(props.baujahr) ?? undefined },
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }))
      }
    }
    return { obstacles }
  },
}
