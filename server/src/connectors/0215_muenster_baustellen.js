// Connector Quelle 0215: Münster — Baustellen (geo.stadt-muenster.de MapServer, WFS).
// Port aus muenster-baustellen-wfs.cron.mjs. WFS 1.1.0 GeoJSON (LineString/Point, CRS84 = WGS84
// lng/lat). MapServer ohne Offset-Pagination → ein Voll-Request, MAXFEATURES großzügig.

import { makeNormalized, getJson, ersterPunkt, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://opendata.stadt-muenster.de/dataset/baustellen"
const QUELLE_NAME = "Münster — Baustellen (geo.stadt-muenster.de, MapServer WFS)"
const URL =
  "https://geo.stadt-muenster.de/mapserv/odbaustellen_serv?SERVICE=WFS&VERSION=1.1.0" +
  "&REQUEST=GetFeature&TYPENAME=baustellen&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&MAXFEATURES=10000"

// "B51 - Brückenneubau" → "B51"
function refAusBezeichnung(b) {
  const m = String(b ?? "").match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}

export const muensterBaustellenConnector = {
  quelleId: "0215",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Ein Voll-Request mit MAXFEATURES=10000 → kompletter (kleiner) Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const data = await getJson(URL, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const typBez = String(p.typ_bez ?? "")
      const text = [p.bezeichnung, p.information].filter(Boolean).join(" ")
      const vollsperrung = /vollsperrung/i.test(typBez) || /vollsperr/i.test(text) || undefined
      // T-453: "Teilsperrung" enthält den Substring "sperrung" → NICHT zu kategorie 'sperrung'
      // hochstufen. Nur echte Voll-/Komplettsperrung (oder "Sperrung" ohne teil/halbseit/einseit).
      const istSperrung = /sperrung/i.test(typBez) && !/teil|halbseit|einseit/i.test(typBez)
      const [lng, lat] = ersterPunkt(f.geometry)
      // Volle Linien-/Flächen-Geometrie als geom durchreichen (für Korridor-Clip, Linien-Render,
      // Gegenfahrbahn-Filter). Quelle liefert WGS84 lng/lat (CRS84, SRSNAME=EPSG:4326) → KEINE
      // Reprojektion. Nur Linien/Flächen, nicht Point (Punkt-Pfad via lat/lng bleibt unverändert).
      const gt = f.geometry?.type
      const geom = gt === "LineString" || gt === "MultiLineString" || gt === "Polygon" || gt === "MultiPolygon"
        ? f.geometry
        : null
      obstacles.push(makeNormalized({
        externeId: p.fuid ?? f.id,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: p.bezeichnung ?? "Baustelle Münster",
        beschreibung: p.information ?? null,
        lat, lng,
        geom,
        strassenRef: refAusBezeichnung(p.bezeichnung),
        attrs: {
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: dateOnly(p.beginntam),
        gueltigVon: dateOnly(p.beginntam),
        gueltigBis: dateOnly(p.endetam),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Münster: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
