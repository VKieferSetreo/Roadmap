// Connector Quelle 0229: Dortmund — GEPLANTE Baustellen (Open Data Dortmund, Opendatasoft).
// Ergänzt 0216 (laufende Baustellen) um die Planungsdaten (status="geplant", Vorlauf). GeoJSON,
// EPSG:4326, Point. Lizenz dl-de/zero-2.0 (keine Namensnennung nötig). Tagesaktuell.
// Kein eigenes Straßen-Feld — Straße steckt am Anfang von art_der_baumassnahme ("Straße - Text").

import { makeNormalized, getJson, dateOnly, stabilHash } from "./_helpers.js"

const QUELLE = "0229"
const QUELLE_NAME = "Dortmund — Geplante Baustellen (Open Data Dortmund)"
const QUELLE_URL = "https://open-data.dortmund.de/explore/dataset/fb66-baustellen-geplant/"
const BASE = "https://open-data.dortmund.de/api/v2/catalog/datasets/fb66-baustellen-geplant/exports/geojson"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const dortmundGeplantConnector = {
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
      const art = p.art_der_baumassnahme || "Baustelle"
      const strasse = String(art).split(" - ")[0]
      const vollsperrung = /vollsperr|gesperrt/i.test(p.einschrankung ?? "") || undefined
      return makeNormalized({
        externeId: `dortmund-geplant#${stabilHash(lat, lng, art)}`,
        kategorie: vollsperrung ? "sperrung" : "baustelle",
        name: art,
        beschreibung: [art, p.einschrankung, p.auftraggeber && `Auftraggeber: ${p.auftraggeber}`].filter(Boolean).join(" · ") || null,
        lat, lng,
        strassenRef: refAus(strasse),
        attrs: { vollsperrung },
        gueltigVon: dateOnly(p.von), gueltigBis: dateOnly(p.bis), realerStart: dateOnly(p.von),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} geplante Baustellen`)
    return { obstacles }
  },
}
