// Connector Quelle 0132: Brandenburg — Baustellen (Landesbetrieb Straßenwesen, GDI-BB WFS).
// WFS 2.0, GeoJSON (outputFormat MUSS application/geo+json — json → HTTP 400), EPSG:25833 nativ
// → utmZuWgs84(.,.,33), LineString. Landesweit B/L/K bis Gemeindeebene, geplant + laufend.
// Lizenz: dl-de/by-2.0 (Namensnennung „Landesbetrieb Straßenwesen Brandenburg"). Frei direkt,
// KEIN Mobilithek-Abo nötig (liegt zusätzlich als offener WFS vor).

import { makeNormalized, fetchAllFeatures, reprojGeom, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE = "0132"
const QUELLE_NAME = "Brandenburg — Baustellen (Landesbetrieb Straßenwesen)"
const QUELLE_URL = "https://isk.geobasis-bb.de/"
const BASE = "https://isk.geobasis-bb.de/ows/baustelleninfo_wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=app:baustelleninfo&outputFormat=application/geo%2Bjson&srsName=EPSG:25833"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const brandenburgBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 20, timeoutMs, log })
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const geom = reprojGeom(f.geometry, 33)
      let c = geom?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const istLinie = geom?.type === "LineString" || geom?.type === "MultiLineString"
      const strasse = p["Straßenummner"] ?? p["Straßennummer"] ?? null
      const text = [p.Verkehrsinformation, p.Art, p.Ortsangabe].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      const vollsperrung = /vollsperr/i.test(text) || undefined
      return makeNormalized({
        externeId: p.ID,
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.Art || p.Ortsangabe || "Baustelle",
        beschreibung: p.Verkehrsinformation || p.Ortsangabe || null,
        lat, lng,
        strassenRef: refAus(strasse) ?? (strasse || null),
        attrs: { maxGewichtT: tonnage, restbreiteM: meterAusText(text, /breite|einengung/i), vollsperrung },
        gueltigVon: dateOnly(p.Baustellen_Beginn), gueltigBis: dateOnly(p.Baustellen_Ende), realerStart: dateOnly(p.Baustellen_Beginn),
        geom: istLinie ? geom : null,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
