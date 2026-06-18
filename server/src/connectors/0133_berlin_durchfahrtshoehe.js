// Connector Quelle 0133: Berlin — Durchfahrtshöhen (GDI-BE Straßenbefahrung-WFS).
// Erstes echtes Landes-Höhenkataster: fahrstreifenscharfe lichte Durchfahrtshöhen aus der
// Berliner Straßenbefahrung 2014/2015 (~23.200 Punkte). WFS 2.0, GeoJSON in EPSG:4326
// (coords schon [lng,lat] → keine Reprojektion). Feld `hoehe` = lichte Höhe in Metern.
// Lizenz: dl-de/zero-2.0 (GDI-BE, OpenData, keine Namensnennung nötig).
//
// Mapping als kategorie "bruecke" → ruleBauwerk wertet maxHoeheM aus: Fund nur bei
// Transporthöhe > Durchfahrtshöhe (sonst "hinweis" = ausgeblendet). So flutet das
// Kataster die Auswertung nicht, liefert aber jede echte Höhen-Kollision entlang der Route.

import { fetchAllFeatures, makeNormalized, num, stabilHash } from "./_helpers.js"

const QUELLE = "0133"
const QUELLE_NAME = "Berlin — Durchfahrtshöhen (Straßenbefahrung, GDI-BE)"
const QUELLE_URL = "https://gdi.berlin.de/services/wfs/strassenbefahrung"
const BASE =
  `${QUELLE_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
  "&TYPENAMES=strassenbefahrung:al_durchfahrtshoehe&OUTPUTFORMAT=application/json" +
  "&SRSNAME=urn:ogc:def:crs:EPSG::4326"

export const berlinDurchfahrtshoehenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7 * * 1", // statisches Kataster (Stand 2014/2015) → wöchentlich reicht
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, {
      mode: "wfs2",
      pageSize: 2000,
      maxPages: 20,
      timeoutMs,
      log,
    })
    const obstacles = []
    let ohneHoehe = 0
    for (const f of feats) {
      const c = f?.geometry?.coordinates
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const hoehe = num(f?.properties?.hoehe)
      if (!(hoehe > 0)) {
        ohneHoehe++
        continue // ohne verwertbare Höhe kein Höhen-Fund
      }
      obstacles.push(
        makeNormalized({
          externeId: f.id ?? f.properties?.gis_id ?? `be-h#${stabilHash(lat, lng, hoehe)}`,
          kategorie: "bruecke",
          name: `Durchfahrtshöhe ${String(hoehe).replace(".", ",")} m`,
          lat,
          lng,
          attrs: { maxHoeheM: hoehe },
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }),
      )
    }
    log(`${QUELLE}: ${feats.length} geladen · ${obstacles.length} Durchfahrtshöhen · ${ohneHoehe} ohne Höhe`)
    return { obstacles }
  },
}
