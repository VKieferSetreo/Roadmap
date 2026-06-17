// Connector Quelle 0210: München — Baustellen (GeoPortal München, mor_wfs).
// Port aus muenchen-baustellen.cron.mjs. WFS 1.1.0 GeoJSON (~5.880 Features, MultiPolygon,
// EPSG:25832), Referenz-Koordinate UTM32 → WGS84. Pagination via startIndex.
// maxPages so hoch, dass der VOLLE Bestand (~5.880) kommt → vollbestand=true.

import { makeNormalized, getJson, utmZuWgs84, reprojGeom, tonnageAusText, meterAusText, dateOnly, stabilHash } from "./_helpers.js"

const PORTAL = "https://geoportal.muenchen.de/portal/opendata/"
const QUELLE_NAME = "München — Baustellen (GeoPortal München, mor_wfs)"
const BASE =
  "https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0" +
  "&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json"
const PAGE = 1000
// Kein künstlicher Deckel: die startIndex-Schleife bricht selbst ab, sobald eine Seite < PAGE liefert
// (= letzte Seite). MAX_PAGES ist nur ein Sicherheits-Guardrail gegen Endlosschleifen, bewusst hoch
// gesetzt, damit auch wachsende Bestände VOLLSTÄNDIG gezogen werden. vollbestand bleibt korrekt true.
const MAX_PAGES = 500

// Erstes gültiges [x,y]-Koordinatenpaar IRGENDWO in der (verschachtelten) Geometrie finden.
// Toleriert alle Geometrie-Typen (Point/LineString/(Multi)Polygon/GeometryCollection) und überspringt
// kaputte/leere Knoten, statt am ersten (evtl. ungültigen) Element zu scheitern → kein Koord-Verlust.
function ersterKoordPaar(node) {
  if (!Array.isArray(node)) return null
  // Blattknoten: [x, y, ...] mit endlichen Zahlen.
  if (typeof node[0] === "number" && typeof node[1] === "number") {
    return Number.isFinite(node[0]) && Number.isFinite(node[1]) ? [node[0], node[1]] : null
  }
  for (const child of node) {
    const found = ersterKoordPaar(child)
    if (found) return found
  }
  return null
}

// Referenzpunkt der Geometrie, UTM32 (EPSG:25832) → WGS84. GeometryCollection wird mit abgedeckt.
function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let pair = ersterKoordPaar(geom.coordinates)
  if (!pair && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries) {
      pair = ersterKoordPaar(g?.coordinates)
      if (pair) break
    }
  }
  if (!pair) return [null, null]
  return utmZuWgs84(pair[0], pair[1], 32)
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
      // Volle (Multi)Polygon-Fläche zusätzlich als geom durchreichen — DERSELBE UTM-Zone-32-Pfad
      // wie der Punkt (EPSG:25832). Reaktiviert Korridor-Clip, Linien-/Flächen-Render und den
      // Gegenfahrbahn-Filter (vorher fiel die Geometrie auf einen Pin zurück). Punkt-Pfad unverändert.
      const geom = f.geometry?.type === "Point" ? null : reprojGeom(f.geometry, 32)
      const text = [p.beschreibung, p.beeintraechtigung, p.weitere_info].filter(Boolean).join(" ")
      const beeintr = String(p.beeintraechtigung ?? "")
      const vollsperrung = /vollsperr/i.test(beeintr) || /vollsperr/i.test(text) || undefined
      // externeId: bei vorhandener fachliche_id diese (verifiziert distinct). Sonst KEIN Fallback auf
      // f.id — das ist der positionsbasierte GeoServer-FID 'baustellen_opendata.<N>', der run-zu-run
      // driftet und unter Reconcile fremde Meldungen überschreibt. Stattdessen ein stabiler, inhalts-
      // basierter Hash über unterscheidende Quellfelder (Straße, von/bis-Datum, Beeinträchtigung) +
      // Geometrie. Gleicher Eintrag → gleicher Hash → reconcile-stabil; verschiedene Meldungen am
      // selben Ort (Fahrtrichtung/Teilstück/Phase) kollidieren dank Datum+Beeinträchtigung nicht.
      const externeId =
        p.fachliche_id ??
        `muc#${stabilHash(
          lat, lng,
          p.strasse_hausnr,
          p.beginn_datum_kombiniert,
          p.ende_datum_kombiniert,
          p.beeintraechtigung,
          p.art,
          (p.beschreibung ?? "").split(/\r?\n/)[0],
        )}`
      obstacles.push(makeNormalized({
        externeId,
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
        geom,
      }))
    }
    log(`München: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
