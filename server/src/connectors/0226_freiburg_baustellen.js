// Connector Quelle 0226: Freiburg i. Br. — Baustellen (FreiGIS, geoportal.freiburg.de).
// WFS 2.0, outputFormat=geojson (exakt so!), EPSG:25832 → utmZuWgs84(.,.,32), Polygon-Umgriffe.
// Polygon wird auf einen Marker-Punkt (erster Stützpunkt) reduziert — Geltungsbereiche rendern
// wir nicht als Strecke. Lizenz DL-DE/BY 2.0, „Geodaten © Stadt Freiburg". Klein (~9 Maßnahmen).

import { makeNormalized, getJson, ersterPunkt, dateOnly } from "./_helpers.js"

const QUELLE = "0226"
const QUELLE_NAME = "Freiburg — Baustellen (FreiGIS)"
const QUELLE_URL = "https://geoportal.freiburg.de/"
const BASE = "https://geoportal.freiburg.de/wfs/gut_baustellen/gut_baustellen" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:baustellenumgriffe&outputFormat=geojson"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const freiburgBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const data = await getJson(BASE, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry, 32)
      const text = [p.bezeichnung, p.verkehrshinweis].filter(Boolean).join(" — ")
      const vollsperrung = /vollsperr|gesperrt/i.test(p.verkehrshinweis ?? "") || undefined
      return makeNormalized({
        externeId: p.fid ?? f.id,
        kategorie: vollsperrung ? "sperrung" : "baustelle",
        name: p.name || "Baustelle",
        beschreibung: text || p.lage || null,
        lat, lng,
        strassenRef: refAus(p.lage), // lage ist eine Lagebeschreibung, kein Straßen-Ref → nur echten Ref übernehmen
        attrs: { vollsperrung },
        gueltigVon: dateOnly(p.zeitraum_von), gueltigBis: dateOnly(p.zeitraum_bis), realerStart: dateOnly(p.zeitraum_von),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
