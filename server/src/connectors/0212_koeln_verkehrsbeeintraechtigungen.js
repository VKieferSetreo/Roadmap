// Connector Quelle 0212: Köln — Verkehrsbeeinträchtigungen (ArcGIS Verkehrskalender).
// Port aus koeln-verkehrsbeeintraechtigungen.cron.mjs. ArcGIS REST MapServer Layer 0 "Standort"
// (TYP-codierte Punkte, GeoJSON EPSG:4326), Pagination via resultOffset/resultRecordCount.

import { makeNormalized, getJson, ersterPunkt, tonnageAusText, meterAusText } from "./_helpers.js"

const PORTAL = "https://offenedaten-koeln.de/dataset/verkehrsbeeinträchtigungen-stadt-köln"
const QUELLE_NAME = "Köln — Verkehrsbeeinträchtigungen (ArcGIS Verkehrskalender)"
const MAPSERVER = "https://geoportal.stadt-koeln.de/arcgis/rest/services/verkehr/verkehrskalender/MapServer"
// T-450: Layer 0 (Standort/Punkt) UND Layer 2 (Bereich/Polygon) — beide tragen die Baustellen-
// Felder (typ/datum_von/datum_bis/beschreibung), live gegen das MapServer-Schema verifiziert.
// Layer 1 (Strecke) + 3 (Verkehrslage) sind LIVE-Verkehrsdaten (auslastung/tendenz, KEINE
// Baustellenfelder) → bewusst ausgelassen (Planungs-Plattform, keine Live-Verkehrsdaten).
const LAYERS = [0, 2]
const PAGE = 1000

function epochToDate(ms) {
  if (ms == null) return null
  const d = new Date(Number(ms))
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

export const koelnVerkehrsbeeintraechtigungenConnector = {
  quelleId: "0212",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Volle Pagination über exceededTransferLimit → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-connector/1.0)" }, timeoutMs }
    const feats = []
    for (const layer of LAYERS) {
      for (let offset = 0; ; offset += PAGE) {
        const url = `${MAPSERVER}/${layer}/query?where=1=1&outFields=*&outSR=4326&f=geojson&resultRecordCount=${PAGE}&resultOffset=${offset}`
        const data = await getJson(url, HEAD)
        const f = data?.features ?? []
        for (const feat of f) feat.__layer = layer // Layer-Herkunft für eindeutige externeId
        feats.push(...f)
        const mehr = data?.exceededTransferLimit || data?.properties?.exceededTransferLimit
        if (!mehr || f.length === 0) break
        if (offset > 100000) break // Sicherheits-Cap
      }
    }

    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      const text = String(p.beschreibung ?? "")
      const istSperrung = /gesperrt|sperrung|nicht möglich|keine einfahrt/i.test(text)
      obstacles.push(makeNormalized({
        // objectid ist nur je-Layer eindeutig → Layer 2 prefixen. Layer 0 bleibt bare objectid
        // (kein Re-Keying des Bestands beim Upsert auf (quelle, externe_id)).
        externeId: f.__layer ? `${f.__layer}-${p.objectid ?? f.id}` : (p.objectid ?? f.id),
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: p.name ?? "Verkehrsbeeinträchtigung Köln",
        beschreibung: text.trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          typ: p.typ ?? undefined,
          vollsperrung: /voll.?gesperrt|vollsperrung/i.test(text) || undefined,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: epochToDate(p.datum_von),
        gueltigVon: epochToDate(p.datum_von),
        gueltigBis: epochToDate(p.datum_bis),
        quelleName: QUELLE_NAME,
        quelleUrl: p.link ? `https://www.stadt-koeln.de${p.link}` : PORTAL,
      }))
    }
    log(`Köln: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
