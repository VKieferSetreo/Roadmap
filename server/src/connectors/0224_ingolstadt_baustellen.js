// Connector Quelle 0224: Ingolstadt — Baustellen (open.bydata.de, Stadt Ingolstadt VMS).
// Statische GeoJSON-Datei (ein Abruf), EPSG:25832 → utmZuWgs84(.,.,32), Point. ~14-Tage-Vorschau
// (laufend + beginnend). Lizenz CC-BY 4.0, Namensnennung „Stadt Ingolstadt". Datum DD.MM.YYYY.

import { makeNormalized, getJson, ersterPunkt, dateOnly } from "./_helpers.js"

const QUELLE = "0224"
const QUELLE_NAME = "Ingolstadt — Baustellen (open.bydata.de)"
const QUELLE_URL = "https://open.bydata.de/api/hub/search/datasets/baustellen_stadt_ingolstadt"
const BASE = "https://www.ingolstadt.de/openbydata/VMS/Baustellen_14_Tage_Ingolstadt.geojson"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const ingolstadtBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 6,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const data = await getJson(BASE, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry, 32)
      const text = [p.ART_ARB, p.ART_VB].filter(Boolean).join(" — ")
      const vollsperrung = /gesamtsperrung|vollsperr|gesperrt/i.test(p.ART_VB ?? "") || undefined
      return makeNormalized({
        externeId: p.AKZ,
        kategorie: vollsperrung ? "sperrung" : "baustelle",
        name: p.STRASSE || "Baustelle",
        beschreibung: text || null,
        lat, lng,
        // T-611: nur A/B/L/K-Klassifikation als strassen_ref — kein Roh-Namen-Fallback (Name steht in name).
        strassenRef: refAus(p.STRASSE) || null,
        attrs: { vollsperrung },
        gueltigVon: dateOnly(p.BEGINN), gueltigBis: dateOnly(p.ENDE), realerStart: dateOnly(p.BEGINN),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
