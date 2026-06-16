// Connector Quelle 0228: Duisburg — Baustellen (Verkehrsportal, geoportal2.duisburg.de, ArcGIS).
// ArcGIS-REST query f=geojson, EPSG:4326 (native), LineString (Layer 3 = echte Straßen-Ausdehnung
// → Strecken-Geometrie für Schwertransport). Lizenz CC-BY 3.0 DE, „Stadt Duisburg". Zeitraum nur
// als EIN Textfeld BAUZEIT_BM ("DD.MM.YY - DD.MM.YY") → am Bindestrich splitten; Endteil teils
// unscharf → dateOnly() liefert dann null. ~46 aktive Baustellen.

import { makeNormalized, getJson, dateOnly, tonnageAusText } from "./_helpers.js"

const QUELLE = "0228"
const QUELLE_NAME = "Duisburg — Baustellen (Verkehrsportal)"
const QUELLE_URL = "https://geoportal2.duisburg.de/"
const BASE = "https://geoportal2.duisburg.de/arcgisserver/rest/services/Masterportal/MP_Verkehrsportal/MapServer/3/query" +
  "?where=1%3D1&outFields=*&outSR=4326&f=geojson"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function zeitraum(bauzeit) {
  const [von, bis] = String(bauzeit ?? "").split(/\s*-\s*/)
  return { von: dateOnly(von), bis: dateOnly(bis) }
}

export const duisburgBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const data = await getJson(BASE, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const typ = f.geometry?.type
      const geom = typ === "LineString" || typ === "MultiLineString" ? f.geometry : null
      let c = f.geometry?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const { von, bis } = zeitraum(p.BAUZEIT_BM ?? p.BAUZEIT_AB)
      const strasse = p.BEZEICHNUNG_AB_MP || p.BEZEICHNUNG_BM_MP || p.BEZEICHNUNG_BM
      const text = [p.ANLASS_TXT_BM, strasse].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      const vollsperrung = /vollsperr/i.test(text) || undefined
      return makeNormalized({
        externeId: `duisburg#${p.OBJECTID}`,
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.BEZEICHNUNG_BM_MP || strasse || "Baustelle",
        beschreibung: p.ANLASS_TXT_BM || null,
        lat, lng,
        strassenRef: refAus(strasse) ?? (p.NUMMER_AB || null),
        attrs: { maxGewichtT: tonnage, vollsperrung },
        gueltigVon: von, gueltigBis: bis, realerStart: von,
        geom,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
