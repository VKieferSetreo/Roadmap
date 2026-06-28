// Connector Quelle 0225: Osnabrück — Baustellen (Geodatenportal geo.osnabrueck.de, ArcGIS-WFS).
// WFS 2.0, outputFormat=GEOJSON (Großschreibung Pflicht!), EPSG:4326 (native, keine Reprojektion),
// Point. Lizenz DL-DE/BY 2.0, Namensnennung „Stadt Osnabrück". Datum DD.MM.YYYY. ~38 Baustellen.

import { makeNormalized, getJson, dateOnly } from "./_helpers.js"

const QUELLE = "0225"
const QUELLE_NAME = "Osnabrück — Baustellen (geo.osnabrueck.de)"
const QUELLE_URL = "https://geo.osnabrueck.de/"
const BASE = "https://geo.osnabrueck.de/arcgis/services/WFS/wfs_verkehr/MapServer/WFSServer" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=WFS_verkehr:Baustellen&outputFormat=GEOJSON"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const osnabrueckBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const data = await getJson(BASE, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      let c = f.geometry?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const text = [p.MERKMALKUR, p.BEEINTRAEC, p.PRESSEINFO].filter(Boolean).join(" — ")
      // T-611: bare „gesperrt" raus (Geh-/Radweg-/Spursperren → Falsch-Kritisch); nur echte Vollsperrung.
      const vollsperrung = /vollsperr|voll gesperrt|komplett gesperrt|gesamtsperrung/i.test(text) || undefined
      return makeNormalized({
        externeId: p.OBJECTID,
        kategorie: vollsperrung ? "sperrung" : "baustelle",
        name: p.STANDORT || "Baustelle",
        beschreibung: text || null,
        lat, lng,
        strassenRef: refAus(p.STANDORT),
        attrs: { vollsperrung },
        gueltigVon: dateOnly(p.DATUMVON), gueltigBis: dateOnly(p.DATUMBIS), realerStart: dateOnly(p.DATUMVON),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
