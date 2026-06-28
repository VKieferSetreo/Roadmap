// Connector Quelle 0156: ViP.NRW — innerörtliche Baustellen/Sperrungen NRW (Verkehrsinformationsportal).
// verkehr.nrw/karte (Liferay + OpenLayers) lädt aus einem OFFENEN GeoServer-Workspace `vipnrw`.
// Vom Land NRW zur Nutzung freigegeben (Max 2026-06-23). Server-seitig als GeoJSON, ohne Auth/JSONP.
//
// WICHTIG (geo-verifiziert 2026-06-23): das vipnrw-WFS ist BUNDESWEIT (lat 47.6–54.4), nicht NRW —
// 61–69 % der Features liegen außerhalb NRW (urban-Layer RP-dominiert: mobilithek.rp.kommunal).
// Darum HARTER NRW-Filter (Bbox + Fremd-Bundesland-Tag raus), sonst dupliziert es 0129 (RLP) etc.
//
// NUR die URBAN-Layer: das ist die echte NRW-innerorts-Lücke (kommunal via mobilithek.nw.kommunal),
// die wir noch NICHT haben (umgeht das ausstehende Mobilithek-0148-Mobidrom-Abo). Die INTERSTATE-
// Layer werden BEWUSST WEGGELASSEN: NRW-gefiltert sind sie zu 82–91 % Dubletten unseres
// nationweiten Autobahn-Bestands (0001/0145/0152 = mobilithek.ald) — kein Mehrwert, nur Doppel-Funde.
// Kein Cross-Source-Dedup nötig, da urban (innerorts) nicht mit unseren Autobahn/AlD-Feeds überlappt.

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0156"
const QUELLE_NAME = "ViP.NRW — Baustellen/Sperrungen innerorts (verkehr.nrw)"
const QUELLE_URL = "https://www.verkehr.nrw/karte"
const WFS = "https://www.verkehr.nrw/geoserver/vipnrw/wfs"

// NUR urban (innerorts NRW-Lücke). interstate = Autobahn-Dup → weggelassen (s.o.).
const LAYERS = [
  "traffic_roadworks_urban_feature",
  "traffic_obstructions_urban_feature",
]

// NRW-Filter: Bbox (grob) + explizit anderes Bundesland (mobilithek.XX. mit XX≠nw) raus.
const NRW = { latMin: 50.30, latMax: 52.55, lngMin: 5.85, lngMax: 9.50 }
function istNRW(identifier, lat, lng) {
  const m = String(identifier ?? "").match(/mobilithek\.([a-z]{2})\./)
  if (m && m[1] !== "nw") return false // RP/NI/HE/… → eigene Connectoren bzw. nicht NRW
  return lat >= NRW.latMin && lat <= NRW.latMax && lng >= NRW.lngMin && lng <= NRW.lngMax
}

// display_type → Kategorie (+ feste attrs). REROUTING (Umleitung = die Ausweich-Route, kein
// Hindernis) und unbekannte/Live-Typen (CONGESTION etc.) werden NICHT emittiert.
const TYPE_MAP = {
  ROADWORKS: { kat: "baustelle", label: "Baustelle" },
  SHORT_TERM_ROADWORKS: { kat: "baustelle", label: "Kurzzeit-Baustelle" },
  CLOSURE: { kat: "sperrung", label: "Sperrung", attrs: { vollsperrung: true } },
  // T-611 (Audit R3, Max-Freigabe): Auf-/Abfahrt = RAMPE, nicht die durchgehende Fahrbahn → KEIN
  // vollsperrung (sonst Falsch-Kritisch „Strecke gesperrt", obwohl der Transport die Rampe nicht fährt).
  // Bleibt als sperrung-Warnung sichtbar.
  CLOSURE_ENTRY_EXIT: { kat: "sperrung", label: "Auf-/Abfahrt gesperrt" },
  WEIGHT_LIMIT: { kat: "gewicht", label: "Gewichtsbeschränkung" },
  WARNING: { kat: "sonstige", label: "Warnung" },
}

/** "3,5" / "7.5 t" → 3.5 (deutsches Dezimal-Komma). Nur für WEIGHT_LIMIT. */
function tonnage(info) {
  const m = String(info ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : null
  return n && n > 0 && n < 200 ? n : null // plausibles t-Limit
}

const layerUrl = (layer) =>
  `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=vipnrw:${layer}` +
  `&outputFormat=application/json&srsName=EPSG:4326`

export const vipnrwBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7,13 * * *", // 2× täglich; aggregierter NRW-Bestand ändert sich laufend
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    const seen = new Set()
    let total = 0, skipped = 0, layerFehler = 0

    for (const layer of LAYERS) {
      let data
      try {
        data = await getJson(layerUrl(layer), { timeoutMs })
      } catch (e) {
        // Einzel-Layer-Ausfall: NICHT die ganze Welle verwerfen, aber Teilbestand signalisieren
        // (complete:false → Importer überspringt den Reconcile, kein false-Deaktivieren).
        layerFehler++
        log(`${QUELLE}: Layer ${layer} fehlgeschlagen: ${e?.message ?? e}`)
        continue
      }
      const feats = data?.features ?? []
      total += feats.length
      for (const f of feats) {
        const p = f.properties ?? {}
        const map = TYPE_MAP[p.display_type]
        if (!map) { skipped++; continue } // REROUTING + Live/Unbekannt raus
        const c = f.geometry?.coordinates
        const lng = Array.isArray(c) ? Number(c[0]) : null
        const lat = Array.isArray(c) ? Number(c[1]) : null
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skipped++; continue }
        if (!istNRW(p.identifier, lat, lng)) { skipped++; continue } // bundesweites WFS → auf NRW eingrenzen

        // Stabile externeId: mobilithek-Situations-Identifier, sonst Layer+id+Lage.
        const eid = p.identifier
          ? `nrw-${p.identifier}`
          : `nrw-${layer}-${p.id}-${lat.toFixed(5)},${lng.toFixed(5)}`
        if (seen.has(eid)) continue
        seen.add(eid)

        const attrs = { ...(map.attrs || {}) }
        if (p.display_type === "WEIGHT_LIMIT") {
          const t = tonnage(p.info)
          if (t) attrs.maxGewichtT = t // explizit → makeNormalized-Gap-Fill greift nicht drüber
        }

        // Beschreibung BEWUSST ohne "X m"/"X t"-Token (sonst extractStammdaten-Scheinwert);
        // die info-Länge ("… km") bliebe ein Extraktions-Risiko → weggelassen, Grenzwert steht in attrs.
        obstacles.push(makeNormalized({
          externeId: eid,
          kategorie: map.kat,
          name: `${map.label} (NRW)`,
          beschreibung: `${map.label} aus dem Verkehrsinformationsportal NRW (verkehr.nrw).`,
          lat, lng,
          attrs,
          gueltigVon: p.start_timestamp ? String(p.start_timestamp).slice(0, 10) : null,
          gueltigBis: p.end_timestamp ? String(p.end_timestamp).slice(0, 10) : null,
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }))
      }
    }

    log(`${QUELLE}: ${obstacles.length} Funde aus ${LAYERS.length - layerFehler}/${LAYERS.length} Layern ` +
        `(${total} Features, ${skipped} übersprungen${layerFehler ? `, ${layerFehler} Layer-Fehler` : ""})`)
    // Bei Layer-Ausfall Teilbestand kennzeichnen → kein zerstörerischer Reconcile.
    return layerFehler > 0 ? { obstacles, complete: false } : { obstacles }
  },
}
