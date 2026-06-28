// Connector Quelle 0214: Stuttgart — Baustellen (Open Data Stuttgart / geoserver.stuttgart.de).
// Port aus stuttgart-geoportal-opendata.cron.mjs. Beide Layer "im_Bau" (aktuell) + "geplant"
// (WFS 2.0 GeoJSON, Point, EPSG:25832), reprojiziert UTM32 → WGS84.

import { makeNormalized, fetchAllFeatures, utmZuWgs84, tonnageAusText, meterAusText, dateOnly, freitextMonatEnde } from "./_helpers.js"

const PORTAL = "https://opendata.stuttgart.de/dataset/baustellen"
const QUELLE_NAME = "Stuttgart — Baustellen (Open Data Stuttgart, geoserver.stuttgart.de)"
const WS = "https://geoserver.stuttgart.de/gdc/Verkehr_Mobilitaet/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json"
const LAYERS = [
  { typ: "Verkehr_Mobilitaet:A66_BAUM_BAUSTELLEN_DATE_WEB_im_Bau_EPSG25832", phase: "im Bau" },
  { typ: "Verkehr_Mobilitaet:A66_BAUM_BAUSTELLEN_DATE_WEB_geplant_EPSG25832", phase: "geplant" },
]

// Stuttgart hat KOORDINATE_X/Y als Strings + Point-Geometrie in EPSG:25832 → reprojizieren.
function ersterPunktUtm32(geom, p) {
  let e, n
  if (geom?.coordinates) {
    let c = geom.coordinates
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
    if (Array.isArray(c) && c.length >= 2) { e = c[0]; n = c[1] }
  }
  if (e == null && p?.KOORDINATE_X) { e = Number(p.KOORDINATE_X); n = Number(p.KOORDINATE_Y) }
  if (!Number.isFinite(e) || !Number.isFinite(n)) return [null, null]
  return utmZuWgs84(e, n, 32)
}

export const stuttgartBaustellenConnector = {
  quelleId: "0214",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Beide Layer voll paginiert → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-connector/1.0)" } }
    const obstacles = []
    for (const L of LAYERS) {
      const base = `${WS}&typeNames=${encodeURIComponent(L.typ)}`
      const feats = await fetchAllFeatures(base, { mode: "wfs2", pageSize: 1000, maxPages: 200, timeoutMs, ...HEAD })
      for (const f of feats) {
        const p = f.properties ?? {}
        const [lng, lat] = ersterPunktUtm32(f.geometry, p)
        const text = [p.ART_ARBEIT, p.VERKEHRSAUSWIRKUNG, p.DETAILS_STANDORT].filter(Boolean).join(" ")
        obstacles.push(makeNormalized({
          externeId: f.id,
          kategorie: "baustelle",
          name: p.STRASSENNAME ?? p.ART_ARBEIT ?? "Baustelle Stuttgart",
          beschreibung: [p.ART_ARBEIT, p.VERKEHRSAUSWIRKUNG].filter(Boolean).join(" — ").trim() || null,
          lat, lng,
          strassenRef: null,
          attrs: {
            // T-611: bare „gesperrt" raus (Geh-/Radweg-/Spursperren → Falsch-Kritisch); nur echte Vollsperrung.
            vollsperrung: /vollsperr|voll gesperrt|komplett gesperrt|gesamtsperrung/i.test(text) || undefined,
            restbreiteM: meterAusText(text, /breite/i),
            maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
            maxGewichtT: tonnageAusText(text),
          },
          realerStart: dateOnly(p.ANFANG),
          gueltigVon: dateOnly(p.ANFANG),
          // T-452: ENDE ist meist Freitext ("Ende Dez. 2029") → erst exaktes Datum, sonst
          // Monat+Jahr-Fallback (letzter Tag des Monats), sonst null. Befristung geht nicht mehr verloren.
          gueltigBis: dateOnly(p.ENDE) ?? freitextMonatEnde(p.ENDE),
          quelleName: QUELLE_NAME,
          quelleUrl: PORTAL,
        }))
      }
      log(`Stuttgart/${L.phase}: ${feats.length} Features`)
    }
    return { obstacles }
  },
}
