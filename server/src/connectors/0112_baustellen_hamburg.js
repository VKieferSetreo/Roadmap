// Connector Quelle 0112: Baustellen Hamburg (stadtweit, BVM/LGV).
// Port aus API/Länder/Hamburg/WFS-Baustellen-Hamburg/baustellen-hamburg.cron.mjs.
// deegree-WFS liefert geo+json unzuverlässig → GML-Parsing (WFS 1.1.0, maxFeatures). Punkt-
// Geometrie in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(e,n,32). Datumsfelder DD.MM.YYYY.

import { makeNormalized, getText, utmZuWgs84, dateOnly, meterAusText } from "./_helpers.js"

const QUELLE_NAME = "Baustellen Hamburg (stadtweit, BVM/LGV)"
const QUELLE_URL = "https://suche.transparenz.hamburg.de/dataset/baustellen-hamburg"
const BASE = "https://geodienste.hamburg.de/hh_wfs_baustellen" // lowercase host wichtig
const URL =
  `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=de.hh.up:baustelle` +
  `&maxFeatures=5000&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`

// Minimaler GML-Parser: featureMember-Blöcke → Felder + Punkt aus <gml:pos>E N</gml:pos>.
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
    const pos = block.match(/<gml:pos[^>]*>([\d.\-]+)\s+([\d.\-]+)<\/gml:pos>/)
    out.push({ gmlId, props, e: pos ? Number(pos[1]) : null, n: pos ? Number(pos[2]) : null })
  }
  return out
}

export const baustellenHamburgConnector = {
  quelleId: "0112",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const xml = await getText(URL, { timeoutMs })
    const feats = parseGml(xml, "baustelle", "de.hh.up")
    log(`Baustellen Hamburg: ${feats.length} Features`)
    const obstacles = []
    for (const { gmlId, props: p, e, n } of feats) {
      const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
      const text = [p.umfang, p.anlass].filter(Boolean).join(" — ")
      obstacles.push(makeNormalized({
        externeId: gmlId,
        kategorie: "baustelle",
        name: p.titel || "Baustelle Hamburg",
        beschreibung: text || null,
        lat, lng,
        attrs: {
          restbreiteM: meterAusText(p.umfang, /breite/i) ?? undefined,
          vollsperrung: p.iststoerung === "true" ? true : undefined,
        },
        realerStart: dateOnly(p.baubeginn),
        gueltigVon: dateOnly(p.baubeginn),
        gueltigBis: dateOnly(p.bauende),
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
