// Connector Quelle 0216: Dortmund — Baustellen (Opendatasoft Explore API v2.1).
// Port aus dortmund-baustellen-ods.cron.mjs. Zwei Punkt-Datensätze (tagesaktuell + geplant),
// Pagination via limit/offset (max limit=100). Koordinaten WGS84 in geo-Feld.

import { makeNormalized, getJson, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

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
    let ohneKoords = 0
    for (const ds of DATASETS) {
      for (let offset = 0; ; offset += LIMIT) {
        const data = await getJson(`${BASE}/${ds.id}/records?limit=${LIMIT}&offset=${offset}`, { timeoutMs })
        const rows = data?.results ?? []
        for (const p of rows) {
          const geo = p.geografische_koordinate ?? p.geo_point_2d ?? {}
          const lat = geo.lat, lng = geo.lon
          if (lat == null || lng == null) ohneKoords++
          const text = [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" ")
          const vollsperrung = /vollsperrung/i.test(text) || undefined
          // externeId: stabile Opendatasoft-Record-ID bevorzugen (eindeutig + reconcile-stabil),
          // sonst alle unterscheidenden Quellfelder hashen — NICHT aus Geometrie ableiten, sonst
          // kollabieren mehrere Meldungen am selben Ort/Datum (und alle koord-losen Records auf
          // undefined-undefined) auf dieselbe externeId und überschreiben sich beim Upsert.
          const quellId = p.recordid ?? p.record_id ?? p.id ?? null
          const externeId = `${ds.id}#${quellId ?? stabilHash(p.von, p.bis, lat, lng, p.art_der_baumassnahme, p.einschrankung, p.strasse, p.ort)}`
          obstacles.push(makeNormalized({
            externeId,
            kategorie: "baustelle",
            name: p.art_der_baumassnahme ?? "Baustelle Dortmund",
            beschreibung: [p.art_der_baumassnahme, p.einschrankung].filter(Boolean).join(" — ").trim() || null,
            lat, lng,
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
        // Voll paginieren: erst stoppen, wenn die Seite kürzer als LIMIT ist (= letzte Seite).
        if (rows.length < LIMIT) break
        if (offset > 1000000) break // Notbremse gegen Endlosschleife — praktisch nie erreicht
      }
    }
    if (ohneKoords) log(`Dortmund: ${ohneKoords} Records ohne Koordinaten (Importer verwirft sie mangels Koords)`)
    log(`Dortmund: ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
