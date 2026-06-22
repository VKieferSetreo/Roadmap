// Connector Quelle 0133: Berlin — Durchfahrtshöhen (GDI-BE Straßenbefahrung-WFS).
// Erstes echtes Landes-Höhenkataster: fahrstreifenscharfe lichte Durchfahrtshöhen aus der
// Berliner Straßenbefahrung 2014/2015 (~23.200 Punkte). WFS 2.0, GeoJSON in EPSG:4326
// (coords schon [lng,lat] → keine Reprojektion). Feld `hoehe` = lichte Höhe in Metern.
// Lizenz: dl-de/zero-2.0 (GDI-BE, OpenData, keine Namensnennung nötig).
//
// Mapping als kategorie "bruecke" → ruleBauwerk wertet maxHoeheM aus: Fund nur bei
// Transporthöhe > Durchfahrtshöhe (sonst "hinweis" = ausgeblendet). So flutet das
// Kataster die Auswertung nicht, liefert aber jede echte Höhen-Kollision entlang der Route.

import { fetchAllFeatures, makeNormalized, num } from "./_helpers.js"

const QUELLE = "0133"
const QUELLE_NAME = "Berlin — Durchfahrtshöhen (Straßenbefahrung, GDI-BE)"
const QUELLE_URL = "https://gdi.berlin.de/services/wfs/strassenbefahrung"
const BASE =
  `${QUELLE_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
  "&TYPENAMES=strassenbefahrung:al_durchfahrtshoehe&OUTPUTFORMAT=application/json" +
  "&SRSNAME=urn:ogc:def:crs:EPSG::4326"

// Raster (~33m) zum Zusammenfassen der fahrstreifenscharfen Punkte je Bauwerk. Die
// Straßenbefahrung liefert pro Spur/Richtung einen Höhenpunkt (oft 3+ je Unterführung) →
// rohe ~23k Features bei nur ~6k echten Orten. Fürs Routing zählt die NIEDRIGSTE lichte
// Höhe je Ort (bindende Beschränkung), darum behalten wir je Rasterzelle das Minimum.
// Konservativ: lieber zu niedrig warnen als eine niedrige Durchfahrt übersehen.
const GRID = 0.0003

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
    // Je ~33m-Rasterzelle den niedrigsten Höhenwert behalten (bindende Beschränkung).
    const cells = new Map()
    let ohneHoehe = 0
    for (const f of feats) {
      const c = f?.geometry?.coordinates
      const lng = Array.isArray(c) ? Number(c[0]) : null
      const lat = Array.isArray(c) ? Number(c[1]) : null
      const hoehe = num(f?.properties?.hoehe)
      // Untergrenze 2,0 m: die Straßenbefahrung misst vereinzelt Bord-/Bodenpunkte (0,1–0,7 m).
      // Solche Artefakte sind keine befahrbaren Durchfahrten — als maxHoeheM würde eine 0,1-m-Höhe
      // JEDEN realen Transport fälschlich als „zu niedrig/kritisch" flaggen (Audit 2026-06-22, FIX-1).
      // Echte niedrige Limits (z.B. 1,8 m) liefert das VZ-Kataster 0134, nicht diese Befahrung.
      if (!(hoehe >= 2.0) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        ohneHoehe++
        continue
      }
      const key = `${Math.round(lat / GRID)}:${Math.round(lng / GRID)}`
      const cur = cells.get(key)
      if (!cur || hoehe < cur.hoehe) cells.set(key, { lat, lng, hoehe, key })
    }
    const obstacles = [...cells.values()].map(({ lat, lng, hoehe, key }) =>
      makeNormalized({
        externeId: `be-h#${key}`, // rasterstabil → Upsert statt Insert über Läufe
        kategorie: "bruecke",
        name: `Durchfahrtshöhe ${String(hoehe).replace(".", ",")} m`,
        lat,
        lng,
        attrs: { maxHoeheM: hoehe },
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }),
    )
    log(`${QUELLE}: ${feats.length} geladen · ${obstacles.length} Orte (niedrigste Höhe je ~33m) · ${ohneHoehe} ohne Höhe`)
    return { obstacles }
  },
}
