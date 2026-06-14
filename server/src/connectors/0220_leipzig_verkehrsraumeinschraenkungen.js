// Connector Quelle 0220: Leipzig — Verkehrsraumeinschränkungen.
// Port aus leipzig-verkehrsraumeinschraenkungen.cron.mjs. WFS 2.0 GeoJSON (Punkt-Layer, ~1.556
// Features, EPSG:25833, ZONE 33!), reprojiziert UTM33 → WGS84. Pagination count/startIndex.

import { makeNormalized, fetchAllFeatures, utmZuWgs84, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://opendata.leipzig.de/dataset/verkehrsraumeinschrankungen-punkte-stadt-leipzig"
const QUELLE_NAME = "Leipzig — Verkehrsraumeinschränkungen"
// ACHTUNG Layer-Casing: Punkte = "Verkehrsraumeinschraenkungen_point" (großes V).
const BASE =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:Verkehrsraumeinschraenkungen_point&outputFormat=application/json"

function ersterPunktUtm33(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 33)
}

export const leipzigVerkehrsraumeinschraenkungenConnector = {
  quelleId: "0220",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // maxPages=5 (≈5.000) deckt den ~1.556-Bestand voll ab → Reconcile erlaubt.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 200, timeoutMs })
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunktUtm33(f.geometry)
      const sparte = String(p.sparte ?? "")
      const sperrart = String(p.sperrart ?? "")
      const text = [sparte, sperrart, p.meldung].filter(Boolean).join(" ")
      const vollsperrung = /vollsperrung|voll gesperrt/i.test(text) || undefined
      const istSperrung = /sperrung/i.test(sperrart)
      obstacles.push(makeNormalized({
        externeId: p.objectid ?? f.id,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: (p.adresse ?? "").trim() || sparte || "Verkehrsraumeinschränkung Leipzig",
        beschreibung: [sparte, sperrart, p.meldung].filter((x) => x && x !== "keine Meldung").join(" — ").trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: dateOnly(p.beginn),
        gueltigVon: dateOnly(p.beginn),
        gueltigBis: dateOnly(p.ende),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Leipzig VRE: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
