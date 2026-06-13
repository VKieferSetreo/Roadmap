// Connector Quelle 0123: BAYSIS Bauwerke (Bayern) — Brücken + Tunnel-/Trogbauwerke.
// Port aus API/Länder/Bayern/BAYSIS-Bauwerke-WFS-WMS/*.cron.mjs.
// Strukturierte GST-Restriktionsquelle (Höhen-/Gewichtsbeschränkung, Brückenklasse,
// Grundsätzliche_Schwertransportsperre). ArcGIS-WFSServer liefert GeoJSON nativ in WGS84,
// paginiert über count/startIndex. Live numberMatched≈12287 → maxPages so gesetzt, dass der
// VOLLE Bestand kommt (pageSize 1500 × 10 = 15000) → vollbestand=true.

import { makeNormalized, fetchAllFeatures } from "./_helpers.js"

const QUELLE = "0123"
const QUELLE_NAME = "BAYSIS Bauwerke (Bayerische Straßenbauverwaltung)"
const QUELLE_URL = "https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/"
const BASE =
  "https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Bauwerke:bauwerke" +
  "&outputFormat=GEOJSON&srsName=EPSG:4326"

function bauwerkName(p) {
  const teile = [p.Art, p.Straßenbezeichnung, p.Bauwerksnummer && `BW ${p.Bauwerksnummer}`].filter(Boolean)
  return teile.join(" ") || "Bauwerk"
}
function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b(A|B|ST|L|K)\s?\d{1,4}\b/)
  return m ? m[0].replace(/\s/, "") : null
}
// "3,60 m" / "4,0" / "30" / "6,0 t" → Zahl (robust, auch ohne Einheit).
function zahlMitEinheit(v) {
  if (v == null || String(v).trim() === "") return null
  const s = String(v).replace(",", ".")
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export const baysisBauwerkeConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 60000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1500, maxPages: 10, timeoutMs })
    log(`${QUELLE}: ${feats.length} Bauwerke geladen`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = f.geometry?.coordinates ?? [null, null] // Point, bereits WGS84 [lng,lat]
      const art = String(p.Art ?? "")
      const kategorie = /tunnel|trog/i.test(art) ? "tunnel" : "bruecke"
      const gstSperre = String(p.Grundsätzliche_Schwertransportsperre ?? "").trim().toLowerCase() === "vorhanden"
      return makeNormalized({
        externeId: p.Bauwerksnummer ?? p.OBJECTID ?? f.id,
        kategorie,
        name: bauwerkName(p),
        beschreibung: art || null,
        lat, lng,
        strassenRef: normRef(p.Straßenbezeichnung),
        attrs: {
          maxHoeheM: zahlMitEinheit(p.Höhenbeschränkung),
          maxGewichtT: zahlMitEinheit(p.Gewichtsbeschränkung),
          grundsaetzlicheGstSperre: gstSperre || undefined,
        },
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    return { obstacles }
  },
}
