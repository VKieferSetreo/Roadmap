// Connector Quelle 0116: Detailnetz Berlin — Ingenieurbauwerke (Brücken/Tunnel).
// Port aus API/Länder/Berlin/Detailnetz-Berlin-Bauwerke-WFS/detailnetz-berlin-bauwerke.cron.mjs.
// GeoServer WFS 2.0, GeoJSON, EPSG:25833 (UTM Zone 33N!) → ersterPunkt(geom, 33). 1005 Bauwerke.

import { makeNormalized, fetchAllFeatures, ersterPunkt } from "./_helpers.js"

const QUELLE_NAME = "Detailnetz Berlin — Ingenieurbauwerke (Brücken/Tunnel)"
const QUELLE_URL = "https://daten.berlin.de/datensaetze/detailnetz-bauwerke-wfs"
const BASE =
  "https://gdi.berlin.de/services/wfs/detailnetz?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=detailnetz:b_bauwerke&outputFormat=application/json"

function katAus(art) {
  const s = String(art ?? "").toUpperCase()
  if (s.startsWith("TU")) return "tunnel"
  if (s.startsWith("BR") || s.startsWith("UF") || s.startsWith("UE")) return "bruecke"
  return "bruecke"
}
function refAus(s) {
  const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

export const detailnetzBerlinBauwerkeConnector = {
  quelleId: "0116",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 200, timeoutMs })
    log(`Detailnetz-Bauwerke: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry, 33)
      obstacles.push(makeNormalized({
        externeId: p.dnbr__sdatenid ?? p.bauwerksnummer ?? f.id,
        kategorie: katAus(p.bauwerksart),
        name: p.bauwerksname || `Bauwerk ${p.bauwerksnummer ?? f.id}`,
        beschreibung: null,
        lat, lng,
        strassenRef: refAus(p.bauwerksname),
        attrs: {},
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
