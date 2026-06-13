// Connector Quelle 0221: Leipzig — Verkehrszeichen-Kataster (GST-Beschränkungen).
// Port aus leipzig-verkehrszeichen.cron.mjs. WFS 2.0 GeoJSON (Punkt, EPSG:25833, ZONE 33!),
// serverseitiger cql_filter auf die GST-relevanten Beschränkungszeichen 262/263/264/265/266.
// Schilder = DAUERHAFTE Restriktionen. Reprojiziert UTM33 → WGS84.

import { makeNormalized, getJson, utmZuWgs84, tonnageAusText, meterAusText } from "./_helpers.js"

const PORTAL = "https://opendata.leipzig.de/dataset/verkehrszeichen-stadt-leipzig"
const QUELLE_NAME = "Leipzig — Verkehrszeichen-Kataster (GST-Beschränkungen)"

// VZ-Nr → Kategorie + attrs-Key + Einheit. 264/265/266 = Meter, 262/263 = Tonnen.
const GST_VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT", einheit: "t" },
  "263": { kat: "gewicht", key: "maxAchslastT", einheit: "t" },
  "264": { kat: "engstelle", key: "maxBreiteM", einheit: "m" },
  "265": { kat: "bruecke", key: "maxHoeheM", einheit: "m" }, // Höhe meist Brücke/Unterführung
  "266": { kat: "engstelle", key: "maxLaengeM", einheit: "m" },
}
const VZ_LISTE = Object.keys(GST_VZ).map((n) => `'${n}'`).join(",")
const BASE =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:verkehrszeichen&outputFormat=application/json" +
  `&cql_filter=${encodeURIComponent(`vz_nr IN (${VZ_LISTE})`)}`
const FALLBACK =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:verkehrszeichen&outputFormat=application/json&count=5000"

function ersterPunktUtm33(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 33)
}
function dateOnlySafe(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

export const leipzigVerkehrszeichenConnector = {
  quelleId: "0221",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Serverseitiger cql_filter zieht alle GST-relevanten Schilder (count=5000 deckt sie voll ab) →
  // kompletter relevanter Bestand, Reconcile erlaubt.
  vollbestand: true,

  async fetch({ timeoutMs = 90000, log = () => {} } = {}) {
    let feats = []
    const data = await getJson(`${BASE}&count=5000`, { timeoutMs })
    if (data) {
      feats = data.features ?? []
    } else {
      // Fallback ohne CQL: erste 5.000 ziehen und clientseitig filtern.
      log("Leipzig VZ: cql_filter fehlgeschlagen → Fallback ohne Filter")
      const fb = await getJson(FALLBACK, { timeoutMs })
      feats = (fb?.features ?? []).filter((f) => GST_VZ[String(f.properties?.vz_nr ?? "")])
    }

    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const vz = GST_VZ[String(p.vz_nr ?? "")]
      if (!vz) continue
      const [lng, lat] = ersterPunktUtm33(f.geometry)
      const text = [p.vz_zus_tx, p.so_av_tx, p.vz_bez].filter(Boolean).join(" ")
      const wert = vz.einheit === "t" ? tonnageAusText(text) : meterAusText(text, null)
      obstacles.push(makeNormalized({
        externeId: p.so_id ?? p.objectid ?? f.id,
        kategorie: vz.kat,
        name: `${p.vz_bez ?? `VZ ${p.vz_nr}`} — ${p.so_seg_sn ?? p.vz_seg_sn ?? ""}`.trim(),
        beschreibung: text.trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          [vz.key]: wert,
        },
        realerStart: dateOnlySafe(p.so_beg ?? p.vz_aufst),
        gueltigVon: dateOnlySafe(p.so_beg ?? p.vz_aufst),
        gueltigBis: dateOnlySafe(p.so_end),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Leipzig VZ: ${feats.length} GST-relevant → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
