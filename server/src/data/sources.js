// Behörden-/Quellen-Pools je Kategorie — portiert aus src/lib/mock/generate.ts
// (buildSourcePool/ZUSTAENDIG_POOL). Auswahl deterministisch über String-Hash
// statt Math.random (Seed muss reproduzierbar sein).

import { hashString } from "../engine/cities.js"

/** OSM-Deep-Link auf die konkrete Geo-Position (Marker + Zoom). */
export function osmDeepLink(lat, lng, zoom = 17) {
  const la = lat.toFixed(5)
  const ln = lng.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=${zoom}/${la}/${ln}`
}

/** Extrahiert das Straßenkürzel ("A24") aus einer Straßen-Ref wie "A24 km 102,3". */
const extractRoad = (strassenRef, fallback = "A4") =>
  (strassenRef ?? "").split(/\s+/)[0] || fallback

/**
 * Pool an Quellen mit möglichst echten Deep-Links je Kategorie.
 * Pseudo-deep-Links bei geschlossenen Systemen (BASt, BKG, DB Netz) zeigen
 * mindestens auf die zuständige Sektion statt nur auf die Domain-Root.
 */
export function buildSourcePool(kategorie, { lat, lng, strassenRef, aktualisiertAm }) {
  const osm = osmDeepLink(lat, lng)
  const road = extractRoad(strassenRef)
  const ahApi = `https://verkehr.autobahn.de/o/autobahn/${road}/services/roadworks`
  const ahApiClosure = `https://verkehr.autobahn.de/o/autobahn/${road}/services/closure`
  const ahApiWarn = `https://verkehr.autobahn.de/o/autobahn/${road}/services/warning`
  const mobiSearch = (q) => `https://mobilithek.info/offers?search=${encodeURIComponent(q)}`

  const bastSib =
    "https://www.bast.de/DE/Ingenieurbau/Anwendungen/SIB-Bauwerke/SIB-Bauwerke.html"
  const bkgDgm =
    "https://www.bkg.bund.de/DE/Produkte-und-Services/Shop-und-Downloads/Digitale-Geodaten/Digitales-Gelaendemodell/digitales-gelaendemodell.html"
  const dbNetzInfra = "https://fahrweg.dbnetze.com/fahrweg-de/start/das_unternehmen"

  const am = aktualisiertAm
  switch (kategorie) {
    case "bruecke":
      return [
        { name: `Autobahn-API · ${road} Closure`, url: ahApiClosure, aktualisiertAm: am },
        { name: "BASt SIB-Bauwerke · Bauwerkssuche", url: bastSib, aktualisiertAm: am },
        { name: "OSM · Brücken-Position", url: osm, aktualisiertAm: am },
      ]
    case "tunnel":
      return [
        { name: "OSM · Tunnel an Position", url: osm, aktualisiertAm: am },
        { name: "BASt SIB-Bauwerke · Tunnelregister", url: bastSib, aktualisiertAm: am },
      ]
    case "engstelle":
      return [
        { name: `Autobahn-API · ${road} Roadworks`, url: ahApi, aktualisiertAm: am },
        { name: `Mobilithek · DATEX-II "${road}"`, url: mobiSearch(`${road} roadworks`), aktualisiertAm: am },
      ]
    case "gewicht":
      return [
        { name: "BASt SIB-Bauwerke · Tragfähigkeit", url: bastSib, aktualisiertAm: am },
        {
          name: "StVO §29(3) · Großraum-/Schwertransport",
          url: "https://www.gesetze-im-internet.de/stvo_2013/__29.html",
          aktualisiertAm: am,
        },
      ]
    case "kreisverkehr":
      return [{ name: "OSM · Kreisverkehr (Position)", url: osm, aktualisiertAm: am }]
    case "baustelle":
      return [
        { name: `Autobahn-API · ${road} Roadworks`, url: ahApi, aktualisiertAm: am },
        { name: `Mobilithek · DATEX-II "${road}"`, url: mobiSearch(`${road} baustelle`), aktualisiertAm: am },
      ]
    case "bahnuebergang":
      return [
        { name: "OSM · railway=level_crossing", url: osm, aktualisiertAm: am },
        { name: "DB Netz · Infrastruktur", url: dbNetzInfra, aktualisiertAm: am },
      ]
    case "steigung":
      return [
        { name: "BKG · DGM200 Höhenmodell", url: bkgDgm, aktualisiertAm: am },
        { name: "OSM · Höhen-Tags an Position", url: osm, aktualisiertAm: am },
      ]
    case "ampel":
      return [
        { name: "OSM · Signalanlage (Position)", url: osm, aktualisiertAm: am },
        { name: `Autobahn-API · ${road} Warnungen`, url: ahApiWarn, aktualisiertAm: am },
      ]
    default:
      return [{ name: "OSM · Position", url: osm, aktualisiertAm: am }]
  }
}

export const ZUSTAENDIG_POOL = {
  bruecke: ["Autobahn GmbH Nordost", "Autobahn GmbH Südwest", "RP Karlsruhe — Bauwerksbehörde"],
  tunnel: ["Autobahn GmbH Nordost · Tunnelleitstelle", "Autobahn GmbH West · Tunnelbetrieb"],
  engstelle: ["Autobahn GmbH · Baustellenkoordination", "Landesbetrieb Mobilität"],
  gewicht: ["RP Karlsruhe — Genehmigungsbehörde (VEMAGS)", "Landratsamt — Straßenverkehrsbehörde"],
  kreisverkehr: ["Kommune — Straßenverkehrsbehörde"],
  baustelle: ["Autobahn GmbH · Niederlassung", "Landesbetrieb Mobilität"],
  bahnuebergang: ["DB Netz AG · Regionalbereich"],
  steigung: [],
  ampel: ["Kommune — Verkehrsleitstelle"],
}

/** Deterministische Pool-Auswahl: gleicher Seed → gleiche Quelle/Zuständigkeit. */
export function pickDeterministic(pool, seed) {
  if (!pool?.length) return undefined
  return pool[hashString(String(seed)) % pool.length]
}
