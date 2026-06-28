// Connector Quelle 0211: Aachen — Baustellen (BSIS, bsis.aachen.de GeoServer).
// Port aus aachen-baustellen-ckan.cron.mjs. WFS 2.0 GeoJSON (Layer BSIS:PUNKTE_ALLE,
// ~407 Baustellen, MultiPoint, EPSG:25832), reprojiziert UTM32 → WGS84.
// Voller Bestand klein → vollbestand=true.

import {
  makeNormalized, fetchAllFeatures, utmZuWgs84, tonnageAusText, meterAusText, dateOnly,
} from "./_helpers.js"

const PORTAL = "https://offenedaten.aachen.de/dataset/baustellen-stadtgebiet-aachen"
const QUELLE_NAME = "Aachen — Baustellen (BSIS, Baustellen-Informationssystem)"
const BASE =
  "https://bsis.aachen.de/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=BSIS:PUNKTE_ALLE&outputFormat=application/json"

function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}

export const aachenBaustellenConnector = {
  quelleId: "0211",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // WFS 2.0 zieht den vollen Bestand (~407) paginiert → Reconcile erlaubt.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 200, timeoutMs })
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunktUtm32(f.geometry)
      // T-455: strukturierte Orts-Felder (strassen/bereich) als Ortskontext nutzen statt zu verwerfen.
      const ort = [p.strassen, p.bereich].filter(Boolean).join(", ")
      const text = [p.beschreibu, p.einschraen, p.name, p.strassen, p.bereich].filter(Boolean).join(" ")
      const vollsperrung = /vollsperr/i.test(text) || undefined
      const refM = String(p.strassen ?? "").match(/\b([ABL])\s?-?\s?(\d{1,4})\b/i)
      obstacles.push(makeNormalized({
        externeId: p.gid ?? p.sdatenid ?? f.id,
        kategorie: "baustelle",
        // T-611: Titel ist die Straße (p.strassen), nicht die Maßnahmen-Art (p.name);
        // die Maßnahmen-Art bleibt vorne in der Beschreibung erhalten.
        name: p.strassen ?? p.name ?? p.art ?? "Baustelle Aachen",
        beschreibung: [p.name, p.beschreibu, p.einschraen, ort].filter(Boolean).join(" — ").trim() || null,
        lat, lng,
        strassenRef: refM ? `${refM[1].toUpperCase()}${refM[2]}` : null,
        attrs: {
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: dateOnly(p.von),
        gueltigVon: dateOnly(p.von),
        gueltigBis: dateOnly(p.bis),
        quelleName: QUELLE_NAME,
        quelleUrl: p.hotlink ?? PORTAL,
      }))
    }
    log(`Aachen: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
