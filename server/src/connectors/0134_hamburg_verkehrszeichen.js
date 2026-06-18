// Connector Quelle 0134: Hamburg — Verkehrszeichen-Beschränkungen (geodienste.hamburg.de WFS).
// Beschilderte Durchfahrtshöhe (Z265), zulässige Gesamtmasse (Z262) und Breite (Z264) aus
// dem Verkehrszeichen-Kataster. WFS 2.0, GeoJSON in EPSG:4326 (coords [lng,lat], kein Reproj).
// Lizenz: dl-de/by-2.0 (Namensnennung „Freie und Hansestadt Hamburg").
//
// Der Beschränkungswert steckt STRUKTURIERT im vz_nr-Suffix: "265-3,8" = 3,8 m Höhe,
// "262-7,5" = 7,5 t Gewicht, "264-2,1" = 2,1 m Breite — KEIN Freitext-Parser nötig.
// Server-seitiger OGC-FILTER (PropertyIsLike) zieht nur diese drei Schild-Typen (~1.500),
// nicht den ~60k-Vollbestand. Z263 (Achslast) bewusst ausgelassen: die Achslast-Auswertung
// wurde aus der Engine entfernt (Max 2026-06-16), und "10 t" im Namen würde sonst fälschlich
// als Gesamtgewicht extrahiert. Z266 (Länge) nicht angefragt.

import { fetchAllFeatures, makeNormalized, num, stripHtml } from "./_helpers.js"

const QUELLE = "0134"
const QUELLE_NAME = "Hamburg — Verkehrszeichen-Beschränkungen (Höhe/Gewicht/Breite)"
const QUELLE_URL = "https://geodienste.hamburg.de/wfs_verkehrszeichen"

const CODES = ["262", "264", "265"]
const FILTER =
  `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:Or>` +
  CODES.map(
    (c) =>
      `<fes:PropertyIsLike wildCard="*" singleChar="." escapeChar="!">` +
      `<fes:ValueReference>vz_nr</fes:ValueReference><fes:Literal>${c}-*</fes:Literal>` +
      `</fes:PropertyIsLike>`,
  ).join("") +
  `</fes:Or></fes:Filter>`
const BASE =
  `${QUELLE_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
  "&TYPENAMES=de.hh.up:verkehrszeichen&OUTPUTFORMAT=application/geo%2Bjson&SRSNAME=EPSG:4326" +
  `&FILTER=${encodeURIComponent(FILTER)}`

/** vz_nr "265-3,8" → { code:"265", wert:3.8 }; ohne verwertbaren Wert → null. */
function parseVz(vzNr) {
  const m = String(vzNr ?? "").match(/^(262|264|265)-(\d+(?:,\d+)?)/)
  if (!m) return null
  const wert = Number(m[2].replace(",", "."))
  return wert > 0 ? { code: m[1], wert } : null
}

function mappe(code, wert) {
  const w = String(wert).replace(".", ",")
  if (code === "265") return { kategorie: "bruecke", name: `Durchfahrtshöhe ${w} m`, attrs: { maxHoeheM: wert } }
  if (code === "262") return { kategorie: "gewicht", name: `Gewichtsbeschränkung ${w} t`, attrs: { maxGewichtT: wert } }
  // 264 Breite: maxBreiteM für ruleEngstelle; restbreiteM mitgesetzt, damit die Freitext-
  // Extraktion in makeNormalized ein No-op bleibt (sonst falsches kiAufbereitet-Flag).
  return { kategorie: "engstelle", name: `Breitenbeschränkung ${w} m`, attrs: { maxBreiteM: wert, restbreiteM: wert } }
}

export const hamburgVerkehrszeichenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7 * * 2", // Kataster, ändert sich selten → wöchentlich
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 20, timeoutMs, log })
    const obstacles = []
    let verworfen = 0
    for (const f of feats) {
      const p = f?.properties ?? {}
      const parsed = parseVz(p.vz_nr)
      const c = f?.geometry?.coordinates
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      if (!parsed || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        verworfen++
        continue
      }
      const { kategorie, name, attrs } = mappe(parsed.code, parsed.wert)
      obstacles.push(
        makeNormalized({
          externeId: f.id ?? `hh-vz#${p.id}`,
          kategorie,
          name,
          beschreibung: stripHtml(p.strassenname) || null,
          lat,
          lng,
          attrs,
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }),
      )
    }
    log(`${QUELLE}: ${feats.length} Schilder geladen · ${obstacles.length} Beschränkungen · ${verworfen} verworfen`)
    return { obstacles }
  },
}
