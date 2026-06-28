// Connector Quelle 0157: SEVAS NRW — LKW-/GST-Restriktionskataster (IT.NRW, Servicestelle
// Verkehrsdaten NRW). AMTLICHE Quelle (speist das LKW-Routing von verkehr.nrw). Offenes WFS 2.0,
// GeoJSON ohne Auth. Research-Fund T-563 (2026-06-23). Schließt die NRW-Lücke bei Durchfahrtshöhe/
// Breite/Länge/Achslast (hatten wir bisher NICHT) + tatsächliches Gewicht.
//
// Geometrie ist OSM-linear-referenziert (osm_id/osm_vers), die RESTRIKTIONS-ATTRIBUTE (typ/wert)
// sind amtlich (IT.NRW). Max-Freigabe 2026-06-23: OSM als Geometrie-Referenz ist ok, SOLANGE die
// Daten von der Behörde kommen — hier der Fall. Wir nutzen die echten WGS84-Koordinaten + amtlichen
// Werte; das osm_id-Feld ist nur interne Referenz.
//
// Format-Falle: OUTPUTFORMAT muss EXAKT "application/json; subtype=geojson; charset=utf-8" sein
// (generisches application/json → HTTP 400). Paging via COUNT/STARTINDEX (~17 Seiten à 2000).

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0157"
const QUELLE_NAME = "SEVAS NRW — LKW-/GST-Restriktionen (IT.NRW)"
const QUELLE_URL = "https://sevas.nrw.de/"
const WFS = "https://sevas.nrw.de/osm/sevas"
const TYPENAME = "ms:restriktionen_segmente"
const GEOJSON = "application/json; subtype=geojson; charset=utf-8"
const PAGE = 2000

// StVO-Verkehrszeichen → Kategorie + attrs-Key. wert = Grenzwert (dt. Dezimalkomma).
// Nur Großraum-/Schwertransport-relevante Zeichen; Gefahrgut(261/269)/Krad(260)/Fahrrad(244.1)/… raus.
const VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT" }, // tats. Gewicht
  "263": { kat: "gewicht", key: "maxAchslastT" }, // Achslast
  "264": { kat: "engstelle", key: "maxBreiteM" }, // Breite
  "265": { kat: "bruecke", key: "maxHoeheM" }, // lichte Höhe / Durchfahrtshöhe
  "266": { kat: "engstelle", key: "maxLaengeM" }, // Länge
}
const VZ_LABEL = { "262": "Gewichtsbeschränkung", "263": "Achslastbeschränkung", "264": "Breitenbeschränkung", "265": "Durchfahrtshöhe", "266": "Längenbeschränkung" }

/** "3,6" / "6" → 3.6 / 6 (dt. Komma). Plausibel (>0, <200). */
function wertNum(w) {
  const m = String(w ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : null
  return n && n > 0 && n < 200 ? n : null
}

function firstCoord(geom) {
  let c = geom?.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  const lng = Number(c?.[0]), lat = Number(c?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

function pageUrl(startIndex) {
  const p = new URLSearchParams({
    SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: TYPENAME,
    OUTPUTFORMAT: GEOJSON, SRSNAME: "EPSG:4326", COUNT: String(PAGE), STARTINDEX: String(startIndex),
  })
  return `${WFS}?${p.toString()}`
}

export const sevasNrwRestriktionenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 4 * * *", // 1× täglich nachts; statisches Restriktionskataster, ändert sich selten
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    let start = 0, total = 0, skipped = 0, pages = 0
    // Defensiver Seiten-Backstop: 33.711 / 2000 ≈ 17 → 40 reicht weit, verhindert Endlosschleife.
    for (; pages < 40; pages++) {
      const data = await getJson(pageUrl(start), { timeoutMs })
      const feats = data?.features ?? []
      total += feats.length
      for (const f of feats) {
        const p = f.properties ?? {}
        const map = VZ[String(p.typ)]
        if (!map) { skipped++; continue } // nicht-SGT-Zeichen raus
        const wert = wertNum(p.wert)
        if (wert == null) { skipped++; continue } // Maß-Zeichen ohne Grenzwert → nichts zu prüfen
        const [lng, lat] = firstCoord(f.geometry)
        if (lat == null) { skipped++; continue }
        const strasse = String(p.name ?? "").trim()
        const ort = [p.gemeinde, p.kreis].filter(Boolean).join(", ")
        const label = VZ_LABEL[String(p.typ)] || "Beschränkung"
        // T-610: Grenzwert IN den Titel (war nur im detail) — „Gewichtsbeschränkung 7,5 t · <Straße>"
        // statt nacktem „Gewichtsbeschränkung". Einheit aus dem attr-Schlüssel (…T = Tonne, sonst Meter).
        const labelMitWert = `${label} ${String(wert).replace(".", ",")} ${/T$/.test(map.key) ? "t" : "m"}`
        obstacles.push(makeNormalized({
          // Beschreibung bewusst OHNE "X m"/"X t"-Token (sonst extractStammdaten-Scheinwert) —
          // der Grenzwert steht strukturiert in attrs.
          externeId: `nrw-sevas-${p.segment_id}-${p.restrkn_id}`,
          kategorie: map.kat,
          name: [labelMitWert, strasse].filter(Boolean).join(" · "),
          beschreibung: `${label} (SEVAS NRW, amtliches Restriktionskataster IT.NRW)${ort ? ` · ${ort}` : ""}`,
          lat, lng,
          strassenRef: strasse || null,
          attrs: { [map.key]: wert }, // explizit → makeNormalized-Gap-Fill greift nicht drüber
          geom: f.geometry && f.geometry.type ? f.geometry : null, // LineString = betroffenes Segment
          quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
        }))
      }
      if (feats.length < PAGE) break // letzte Seite
      start += PAGE
    }
    log(`${QUELLE}: ${obstacles.length} Restriktionen (Höhe/Gewicht/Breite/Länge/Achslast) aus ${total} Segmenten (${pages + 1} Seiten, ${skipped} übersprungen)`)
    return { obstacles }
  },
}
