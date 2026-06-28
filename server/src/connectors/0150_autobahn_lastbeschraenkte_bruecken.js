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

// T-611: Straßen-Refs in Textreihenfolge aus einem Namensfragment ("BAB 14" → A14, "B 2" → B2,
// "St 2063" → ST2063). "BAB" → A normalisiert (sonst greift normRoadRef im Engine-Überführungs-
// filter nicht). Liefert die Refs in Reihenfolge ihres Auftretens.
function refsIn(s) {
  const out = []
  for (const m of String(s ?? "").matchAll(/\b(BAB|A|B|L|K|St|S)\s?0*(\d{1,4})\b/gi)) {
    let p = m[1].toUpperCase()
    if (p === "BAB") p = "A"
    else if (p === "S") p = "ST"
    out.push(p + m[2])
  }
  return out
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
      let strassenRef = strM ? `A${strM[1]}` : null

      // T-611: Bauwerksname-Muster "X über Y" / "i.Z./im Zuge der X über Y": X (vor "über") ist die
      // GETRAGENE (vom Transport befahrene) Straße, Y (nach "über") die GEKREUZTE (unterquerte). Vorher
      // zog strassenRef die erste A-Nummer im Namen → bei "Brücke B 2 über A3" die GEKREUZTE A3 statt
      // der getragenen B2, bei "im Zuge der BAB 14 über die B 189" die A14 statt der gekreuzten B189.
      // Token VOR "über" (letzter Ref links) = getragen; Token NACH "über" (erster Ref rechts) = gekreuzt.
      let getrageneStrasse = null
      let gekreuzteStrasse = null
      const ueberM = bwName.match(/^(.*?)\s(?:über|ueber|ü\.)\s+(.*)$/i)
      if (ueberM) {
        const linkeRefs = refsIn(ueberM[1])
        const rechteRefs = refsIn(ueberM[2])
        getrageneStrasse = linkeRefs.length ? linkeRefs[linkeRefs.length - 1] : null
        gekreuzteStrasse = rechteRefs.length ? rechteRefs[0] : null
        // Angezeigtes Label = die getragene Straße (nur wenn eindeutig geparst); sonst Altverhalten.
        if (getrageneStrasse) strassenRef = getrageneStrasse
      }

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
          // T-611: getragene (vor "über") + gekreuzte (nach "über") Straße → autoritativer
          // isCrossingStructure-Pfad im Engine-Überführungsfilter (spiegelt 0153/T-610): Route auf
          // der getragenen Straße fährt DRÜBER (behalten), Route auf der gekreuzten fährt DRUNTER
          // durch = Überführung (raus). Kein "über"-Muster → kein Strukturfeld → bisheriges Verhalten.
          ...(getrageneStrasse && { getrageneStrasse }),
          ...(gekreuzteStrasse && { gekreuzteStrasse }),
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
