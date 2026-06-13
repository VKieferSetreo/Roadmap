// Connector Quelle 0210: München — Baustellen (GeoPortal München, mor_wfs).
// Port aus muenchen-baustellen.cron.mjs. WFS 1.1.0 GeoJSON (~5.880 Features, MultiPolygon,
// EPSG:25832), Referenz-Koordinate UTM32 → WGS84. Pagination via startIndex.
// maxPages so hoch, dass der VOLLE Bestand (~5.880) kommt → vollbestand=true.

import { makeNormalized, getJson, utmZuWgs84, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://geoportal.muenchen.de/portal/opendata/"
const QUELLE_NAME = "München — Baustellen (GeoPortal München, mor_wfs)"
const BASE =
  "https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0" +
  "&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json"
const PAGE = 1000
// Der Standalone-Cron deckelt auf 3 Seiten (Verifikations-Cap). Für die echte Engine ziehen wir
// den vollen Bestand (~5.880) → 10 Seiten reichen großzügig, vollbestand bleibt korrekt true.
const MAX_PAGES = 10

// Referenzpunkt = erste Koordinate der (Multi)Polygon-Geometrie, UTM32 (EPSG:25832) → WGS84.
function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}

export const muenchenBaustellenConnector = {
  quelleId: "0210",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // maxPages=10 zieht den vollen ~5.880er-Bestand → Reconcile erlaubt.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const feats = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await getJson(`${BASE}&maxFeatures=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs })
      const f = data?.features ?? []
      feats.push(...f)
      if (f.length < PAGE) break
    }

    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunktUtm32(f.geometry)
      const text = [p.beschreibung, p.beeintraechtigung, p.weitere_info].filter(Boolean).join(" ")
      const beeintr = String(p.beeintraechtigung ?? "")
      const vollsperrung = /vollsperr/i.test(beeintr) || /vollsperr/i.test(text) || undefined
      obstacles.push(makeNormalized({
        externeId: p.fachliche_id ?? f.id,
        kategorie: "baustelle",
        name: p.strasse_hausnr ?? p.art ?? "Baustelle München",
        beschreibung: text.trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: dateOnly(p.beginn_datum_kombiniert),
        gueltigVon: dateOnly(p.beginn_datum_kombiniert),
        gueltigBis: dateOnly(p.ende_datum_kombiniert),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`München: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
