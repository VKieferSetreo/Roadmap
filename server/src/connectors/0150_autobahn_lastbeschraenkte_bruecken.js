// Connector Quelle 0150: Autobahn GmbH — Lastbeschränkte Brücken (BUNDESWEIT).
// Quelle = öffentlicher ArcGIS-Online-FeatureServer hinter dem GST-WebApp-Viewer der
// Autobahn GmbH (autobahn.maps.arcgis.com, App b6b86f3d…). Das ist die sicherheitskritische
// Schicht: Brücken, über die genehmigungspflichtiger Schwerverkehr GAR NICHT oder nur unter
// Last-/Höhenlimit darf. Ergänzt 0124 (NRW) um den bundesweiten Autobahn-Bestand.
//
// Beschränkung ist Freitext (~45 Muster): numerisches Limit ("max. 44t", "Fahrverbot über 84t",
// "ab 60 Tonnen", "140 t", "… 60 to") → maxGewichtT; harte Sperre ("gesperrt für Schwerverkehr",
// "ST-Sperre", "für jeglichen Verkehr gesperrt") → maxGewichtT 0 (Schwertransport nie zulässig →
// immer kritisch) + grundsaetzlicheGstSperre. Durchfahrtshöhe wo angegeben → maxHoeheM.

import { makeNormalized, getJson, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

const QUELLE = "0150"
const QUELLE_NAME = "Autobahn GmbH — Lastbeschränkte Brücken (GST, bundesweit)"
const QUELLE_URL =
  "https://services-eu1.arcgis.com/46eZsDVh7oveCuwo/arcgis/rest/services/lastbeschr%C3%A4nkte_Br%C3%BCcken/FeatureServer/0"
const LAYER = `${QUELLE_URL}/query`

function ersteKoordinate(geom) {
  if (!geom || !Array.isArray(geom.coordinates)) return [null, null]
  let cur = geom.coordinates
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  const lng = Number(cur?.[0])
  const lat = Number(cur?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

async function ladeAlle({ pageSize = 2000, maxPages = 50, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page += 1) {
    const url = `${LAYER}?where=1%3D1&outFields=*&outSR=4326&f=geojson` +
      `&resultRecordCount=${pageSize}&resultOffset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data?.features ?? []
    all.push(...feats)
    if (feats.length < pageSize) break
  }
  return all
}

export const autobahnLastbeschraenkteBrueckenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await ladeAlle({ timeoutMs })
    log(`${QUELLE}: ${feats.length} lastbeschränkte Brücken`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersteKoordinate(f.geometry)
      const beschr = String(p.Beschränkung ?? p.Beschraenkung ?? "").trim()
      const bwName = String(p.Bauwerksname ?? "").trim()
      const bwNr = p.Bauwerksnummer != null ? String(p.Bauwerksnummer).trim() : null

      const tonnage = tonnageAusText(beschr, { requireKontext: false }) // p.Beschränkung IST das Lastlimit (T-253)
      const maxHoeheM = meterAusText(beschr, /durchfahrtsh[öo]he|h[öo]he/i)
      // JEDE Brücke auf der lastbeschränkte-Brücken-Liste IST beschränkt. Ohne numerisches
      // Gewichtslimit UND ohne Höhenangabe → konservativ als Vollsperre behandeln (kritisch),
      // auch bei "gesperrt"/"ST-Sperre" ODER unparsebarem/leerem Text — Max: "auch die ohne
      // Abmaße mitnehmen, kann sein dass wir die gar nicht fahren können". Kein Feature fällt raus.
      const gesperrtKomplett = tonnage == null && maxHoeheM == null

      // Straßen-Ref aus dem Bauwerksnamen ("A 7 / NOK …" → A7).
      const strM = bwName.match(/\bA\s?(\d+)\b/i)
      const strassenRef = strM ? `A${strM[1]}` : null

      // Stabil + eindeutig: Teilbauwerks-ID + Hash aus Geometrie/Beschränkung (zwei Schilder
      // am selben Bauwerk kollabieren nicht).
      const quellId = String(p.Teilbauwerks_ID_Nummer ?? p.OBJECTID ?? f.id ?? "x").trim()
      const externeId = `${quellId}#${stabilHash(lat, lng, beschr)}`

      return makeNormalized({
        externeId,
        kategorie: "bruecke",
        name: bwName || (bwNr ? `Brücke ${bwNr}` : "Lastbeschränkte Brücke"),
        // Bauwerksnummer mit in den Text → über die Karten-Suche (Strg+F) auffindbar.
        beschreibung: [
          beschr || "Lastbeschränkte Brücke — Beschränkung vor Ort prüfen",
          bwNr ? `Bauwerksnummer ${bwNr}` : null,
        ].filter(Boolean).join(" · "),
        lat, lng,
        strassenRef,
        attrs: {
          ...(tonnage != null && { maxGewichtT: tonnage }),
          ...(maxHoeheM != null && { maxHoeheM }),
          ...(gesperrtKomplett && { gesperrtKomplett: true }),
        },
        quelleName: QUELLE_NAME,
        quelleUrl: "https://autobahn.maps.arcgis.com/apps/webappviewer/index.html?id=b6b86f3d26ab4f07a73e265aad097f38",
      })
    })

    const mitGeo = obstacles.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
    log(`${QUELLE}: ${mitGeo.length}/${obstacles.length} mit Koordinaten`)
    return { obstacles: mitGeo }
  },
}
