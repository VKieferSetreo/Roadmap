// Connector Quelle 0114: Berlin VIZ — Baustellen/Sperrungen/Störungen (mdhwfs).
// Port aus API/Länder/Berlin/VIZ-Berlin-Baustellen-WFS/viz-berlin-baustellen.cron.mjs.
// GeoServer WFS 2.0, GeoJSON, EPSG:4326 (keine Reprojektion). Geometrie = GeometryCollection
// (Point + optional LineString). validity = JSON-String { from, to } (dd.mm.yyyy [HH:MM]).

import { makeNormalized, fetchAllFeatures, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE_NAME = "Berlin VIZ — Baustellen/Sperrungen/Störungen (mdhwfs)"
const QUELLE_URL = "https://daten.berlin.de/datensaetze?groups=verkehr"
const BASE =
  "https://api.viz.berlin.de/geoserver/mdhwfs/wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=mdhwfs:baustellen_sperrungen&outputFormat=application/json&srsName=EPSG:4326"

function katAus(subtype) {
  const s = String(subtype ?? "").toLowerCase()
  if (s.includes("baustelle")) return "baustelle"
  if (s.includes("sperrung")) return "sperrung"
  return "sperrung"
}
function geomPunkt(geometry) {
  if (!geometry) return [null, null]
  const geoms = geometry.type === "GeometryCollection" ? geometry.geometries : [geometry]
  let point = [null, null], line = null
  for (const g of geoms) {
    if (g.type === "Point" && point[0] == null) point = g.coordinates
    if ((g.type === "LineString" || g.type === "MultiLineString") && !line) line = g
  }
  if (point[0] == null && line) { let c = line.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; point = c }
  return point
}
function validity(v) {
  if (!v) return { von: null, bis: null }
  try { const o = typeof v === "string" ? JSON.parse(v) : v; return { von: dateOnly(o.from), bis: dateOnly(o.to) } }
  catch { return { von: null, bis: null } }
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const vizBerlinBaustellenConnector = {
  quelleId: "0114",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 5, timeoutMs })
    log(`VIZ-Berlin-Baustellen: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const point = geomPunkt(f.geometry)
      const { von, bis } = validity(p.validity)
      const text = [p.section, p.content].filter(Boolean).join(" — ")
      const kat = katAus(p.subtype)
      const tonnage = tonnageAusText(text)
      obstacles.push(makeNormalized({
        externeId: p.id ?? f.id,
        kategorie: tonnage ? "gewicht" : kat,
        name: p.street || p.section || `${p.subtype ?? "Meldung"} Berlin`,
        beschreibung: text || null,
        lat: point[1], lng: point[0],
        strassenRef: refAus(`${p.street ?? ""} ${p.section ?? ""}`),
        attrs: {
          maxGewichtT: tonnage ?? undefined,
          restbreiteM: meterAusText(text, /breite/i) ?? undefined,
          vollsperrung: /vollsperr|gesperrt/i.test(text) || undefined,
        },
        gueltigVon: von, gueltigBis: bis, realerStart: von,
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
