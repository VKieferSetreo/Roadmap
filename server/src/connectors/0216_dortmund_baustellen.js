// Connector Quelle 0216: Dortmund — Baustellen (Opendatasoft Explore API v2.1).
// Port aus dortmund-baustellen-ods.cron.mjs. Zwei Punkt-Datensätze (tagesaktuell + geplant),
// Pagination via limit/offset (max limit=100). Koordinaten WGS84 in geo-Feld.

import { makeNormalized, getJson, tonnageAusText, meterAusText } from "./_helpers.js"

const PORTAL = "https://open-data.dortmund.de/explore/?q=baustelle"
const QUELLE_NAME = "Dortmund — Baustellen (Opendatasoft)"
const DATASETS = [
  { id: "fb66-baustellen-tagesaktuell", phase: "tagesaktuell" },
  { id: "fb66-baustellen-geplant", phase: "geplant" },
]
const BASE = "https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets"
const LIMIT = 100

export const dortmundBaustellenConnector = {
  quelleId: "0216",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Beide Punkt-Datensätze voll paginiert → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const obstacles = []
    for (const ds of DATASETS) {
      for (let offset = 0; ; offset += LIMIT) {
        const data = await getJson(`${BASE}/${ds.id}/records?limit=${LIMIT}&offset=${offset}`, { timeoutMs })
        const rows = data?.results ?? []
        for (const p of rows) {
          const geo = p.geografische_koordinate ?? p.geo_point_2d ?? {}
          const text = [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" ")
          const vollsperrung = /vollsperrung/i.test(text) || undefined
          obstacles.push(makeNormalized({
            externeId: `${ds.id}-${p.von ?? ""}-${geo.lon}-${geo.lat}`,
            kategorie: "baustelle",
            name: p.art_der_baumassnahme ?? "Baustelle Dortmund",
            beschreibung: [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" — ").trim() || null,
            lat: geo.lat, lng: geo.lon,
            strassenRef: null,
            attrs: {
              vollsperrung,
              restbreiteM: meterAusText(text, /breite/i),
              maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
              maxGewichtT: tonnageAusText(text),
            },
            realerStart: p.von ?? null,
            gueltigVon: p.von ?? null,
            gueltigBis: p.bis ?? null,
            quelleName: QUELLE_NAME,
            quelleUrl: PORTAL,
          }))
        }
        if (rows.length < LIMIT) break
        if (offset > 10000) break // Sicherheits-Cap
      }
    }
    log(`Dortmund: ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
