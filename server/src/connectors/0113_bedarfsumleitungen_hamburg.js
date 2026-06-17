// Connector Quelle 0113: Bedarfsumleitungen Hamburg (BWVI).
// Port aus API/Länder/Hamburg/WFS-Bedarfsumleitungen-Hamburg/bedarfsumleitungen-hamburg.cron.mjs.
// Ausgeschilderte Notumleitungen für BAB + autobahnähnliche Bundesstraßen (VZ 460/455).
// deegree geo+json unzuverlässig → GML-Parsing (WFS 1.1.0). LineString posList in EPSG:25832
// (UTM Zone 32N) → utmZuWgs84(e,n,32). ~2109 Features. GST-Ausweichkorridor → umleitung=true.

import { makeNormalized, getText, utmZuWgs84 } from "./_helpers.js"

const QUELLE_NAME = "Bedarfsumleitungen Hamburg (BWVI)"
const BASE = "https://geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen"
const URL =
  `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=app:bedarfsumleitungen` +
  `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`

function parseGml(xml, local, ns) {
  if (!xml) return []
  const out = []
  const re = new RegExp(`<${ns}:${local}\\b[^>]*gml:id="([^"]*)"[^>]*>([\\s\\S]*?)</${ns}:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const gmlId = m[1], block = m[2]
    const props = {}
    const pre = new RegExp(`<${ns}:([a-z_0-9]+)>([^<]*)</${ns}:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) if (!(pm[1] in props)) props[pm[1]] = pm[2].trim()
    const pl = block.match(/<gml:posList[^>]*>([\d.\s\-]+)<\/gml:posList>/)
    let coords = null
    if (pl) {
      const nums = pl[1].trim().split(/\s+/).map(Number)
      coords = []
      for (let i = 0; i + 1 < nums.length; i += 2) coords.push(utmZuWgs84(nums[i], nums[i + 1], 32))
    }
    out.push({ gmlId, props, coords })
  }
  return out
}

export const bedarfsumleitungenHamburgConnector = {
  quelleId: "0113",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 90000, log = () => {} } = {}) {
    const xml = await getText(URL, { timeoutMs })
    const feats = parseGml(xml, "bedarfsumleitungen", "app")
    log(`Bedarfsumleitungen Hamburg: ${feats.length} Features`)
    const obstacles = []
    for (const { gmlId, props: p, coords } of feats) {
      const first = coords?.[0] ?? [null, null]
      // coords sind bereits WGS84 [lng,lat] (parseGml reprojiziert per utmZuWgs84(...,32)) →
      // die volle Linie direkt durchreichen (KEIN erneutes reprojGeom — wäre Doppel-Reprojektion).
      // Korridor-Clip / Linien-Render / Gegenfahrbahn-Filter brauchen die echte LineString-Geometrie.
      const geom = coords && coords.length >= 2 ? { type: "LineString", coordinates: coords } : null
      obstacles.push(makeNormalized({
        externeId: gmlId,
        kategorie: "sperrung",
        name: `Bedarfsumleitung ${p.umleitung ?? ""} (${p.strassenname ?? ""})`.trim(),
        beschreibung: p.wegeart ? `${p.wegeart}${p.umleitung ? ` · ${p.umleitung}` : ""}` : null,
        lat: first[1], lng: first[0],
        geom,
        strassenRef: p.strassenschluessel ?? (p.strassenname?.match(/\b([ABLK])\s?(\d{1,4})\b/)?.slice(1, 3).join("") ?? null),
        attrs: { umleitung: true },
        quelleName: QUELLE_NAME,
        quelleUrl: BASE,
      }))
    }
    return { obstacles }
  },
}
