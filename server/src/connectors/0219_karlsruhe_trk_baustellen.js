// Connector Quelle 0219: Karlsruhe / TRK — Baustellen (mobil.trk.de GeoServer).
// Port aus karlsruhe-trk-baustellen.cron.mjs. Beide Layer "aktuell" + "vorschau" (WFS 1.0.0
// GeoJSON, Point, EPSG:25832), reprojiziert UTM32 → WGS84. Regionaler Aggregator (Karlsruhe,
// Ettlingen, Rastatt, Baden-Baden, Bruchsal, Rheinstetten, Stutensee + Alsace).

import { makeNormalized, getJson, utmZuWgs84, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://transparenz.karlsruhe.de/dataset/baustellen"
const QUELLE_NAME = "Karlsruhe / TRK — Baustellen (TechnologieRegion Karlsruhe)"
const WS = "https://mobil.trk.de/geoserver/TBA/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json"
const LAYERS = [
  { typ: "TBA:baustellen_aktuell", phase: "aktuell" },
  { typ: "TBA:baustellen_vorschau", phase: "vorschau" },
]

function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}

export const karlsruheTrkBaustellenConnector = {
  quelleId: "0219",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Beide Layer mit maxFeatures=10000 voll gezogen → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    for (const L of LAYERS) {
      const data = await getJson(`${WS}&typeName=${encodeURIComponent(L.typ)}&maxFeatures=10000`, { timeoutMs })
      const feats = data?.features ?? []
      for (const f of feats) {
        const p = f.properties ?? {}
        const [lng, lat] = ersterPunktUtm32(f.geometry)
        const text = [p.art, p.lage, p.zusatzinfo, p.sperrung].filter(Boolean).join(" ")
        const sperrung = String(p.sperrung ?? "")
        // T-611: bare „gesperrt" raus (matchte Geh-/Radweg-/Spur-/Richtungssperren → Falsch-Kritisch).
        // Nur echte Vollsperrungen (kontrolliertes Vokabular, analog _helpers.js).
        const vollsperrung = /vollsperr|voll gesperrt|komplett gesperrt|gesamtsperrung|fermeture totale/i.test(text) || undefined
        const istSperrung = sperrung && /sperrung|gesperrt|fermeture/i.test(sperrung)
        obstacles.push(makeNormalized({
          externeId: `${L.phase}-${p.id ?? f.id}`,
          kategorie: istSperrung ? "sperrung" : "baustelle",
          name: p.lage ?? p.art ?? "Baustelle TRK",
          beschreibung: [p.art, p.lage, p.zusatzinfo].filter(Boolean).join(" — ").replace(/<[^>]+>/g, " ").trim() || null,
          lat, lng,
          strassenRef: null,
          attrs: {
            vollsperrung,
            restbreiteM: meterAusText(text, /breite/i),
            maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
            maxGewichtT: tonnageAusText(text),
          },
          realerStart: dateOnly(p.vorgangszeitraum_von),
          gueltigVon: dateOnly(p.vorgangszeitraum_von),
          gueltigBis: dateOnly(p.vorgangszeitraum_bis),
          quelleName: QUELLE_NAME,
          quelleUrl: PORTAL,
        }))
      }
      log(`Karlsruhe/${L.phase}: ${feats.length} Features`)
    }
    return { obstacles }
  },
}
