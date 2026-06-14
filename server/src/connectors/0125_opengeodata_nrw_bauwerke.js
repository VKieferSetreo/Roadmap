// Connector Quelle 0125: OpenGeodata.NRW / Straßen.NRW — Bauwerke (Brücken/Tunnel).
// Port aus API/Länder/Nordrhein-Westfalen/opengeodata-nrw-strassennetz/*.cron.mjs.
// NUR der Bauwerke-Layer (ms:Bauwerke); nur Brücke/Tunnel/Trog sind echte GST-Hindernisse.
// WFS liefert NUR GML 3.2 (kein GeoJSON) → dependency-freier GML-Parser. SRSNAME=EPSG:4326 →
// <gml:pos> = "lat lon". Live numberMatched≈19242 → maxPages so gesetzt, dass der VOLLE Bestand
// kommt (pageSize 2000 × 10 = 20000) → vollbestand=true.

import { makeNormalized, getText, stabilHash } from "./_helpers.js"

const QUELLE = "0125"
const QUELLE_NAME = "OpenGeodata.NRW / Straßen.NRW — Bauwerke (Brücken/Tunnel)"
const QUELLE_URL = "https://www.opengeodata.nrw.de/produkte/transport_verkehr/strassennetz/"
const WFS = "https://www.wfs.nrw.de/wfs/strassen_nrw"
const PAGE = 2000
const MAX_PAGES = 10 // voller Bestand (~19242 Bauwerke)
const HINDERNIS_ARTEN = /brücke|tunnel|trog/i

function tag(s, name, re) {
  const r = re ?? new RegExp(`<ms:${name}>([\\s\\S]*?)</ms:${name}>`)
  const m = s.match(r)
  return m ? m[1] : null
}
function dec(s) {
  return s == null ? null : s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || null
}

async function ladeAlle({ timeoutMs = 60000 } = {}) {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:Bauwerke` +
      `&SRSNAME=urn:ogc:def:crs:EPSG::4326&COUNT=${PAGE}&STARTINDEX=${page * PAGE}`
    const xml = await getText(url, { timeoutMs })
    const members = (xml ?? "").match(/<ms:Bauwerke\b[\s\S]*?<\/ms:Bauwerke>/g) ?? []
    all.push(...members)
    if (members.length < PAGE) break
  }
  return all
}

export const opengeodataNrwBauwerkeConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 60000, log = () => {} } = {}) {
    const members = await ladeAlle({ timeoutMs })
    const obstacles = []
    let verworfen = 0
    for (const m of members) {
      const bw = tag(m, "BW") // "Brücke" / "Tunnel/Trogbauwerke" / "Stützbauwerk" / ...
      if (!bw || !HINDERNIS_ARTEN.test(bw)) { verworfen++; continue }
      // gml:id (z.B. "Bauwerke.3517507") ist je Feature/Teilbauwerk garantiert eindeutig + run-zu-run
      // stabil → die reconcile-stabile, kollisionsfreie Primärquelle für die externeId.
      const gid = tag(m, null, /<ms:Bauwerke\b[^>]*\bgml:id="([^"]+)"/)
      // TBWNR (Teilbauwerksnummer) trennt Sub-Bauwerke EINER Brücke (z.B. je Fahrtrichtung), die sich
      // denselben BWNR + dieselbe pos + denselben BWNAME teilen — MUSS in die Fallback-ID.
      const tbwnr = (tag(m, "TBWNR") ?? "").trim()
      const pos = tag(m, null, /<gml:pos>([^<]+)<\/gml:pos>/) // "lat lon" (EPSG:4326-Achsfolge)
      // Koordinaten retten: posList (Linie/Fläche → erstes Koordinatenpaar) als Fallback, falls kein
      // einzelner gml:pos vorhanden ist — keinen Eintrag wegen fehlender Koords verlieren.
      const posList = pos ?? (() => {
        const pl = tag(m, null, /<gml:posList[^>]*>([^<]+)<\/gml:posList>/)
        if (!pl) return null
        const nums = pl.trim().split(/\s+/)
        return nums.length >= 2 ? `${nums[0]} ${nums[1]}` : null
      })()
      const [lat, lng] = posList ? posList.trim().split(/\s+/).map(Number) : [null, null]
      const kategorie = /tunnel|trog/i.test(bw) ? "tunnel" : "bruecke"
      const strkl = (tag(m, "STRKL") ?? "").trim()
      const strnr = (tag(m, "STRNR") ?? "").trim()
      const props = {
        BWNR: tag(m, "BWNR")?.trim(), BWNAME: dec(tag(m, "BWNAME")), BWART: tag(m, "BWART"),
        STRBEZ: tag(m, "STRBEZ"), ORT: tag(m, "ORT"),
      }
      obstacles.push(makeNormalized({
        // gml:id ist je Teilbauwerk garantiert eindeutig + stabil → bevorzugte externeId (kollisionsfrei,
        // reconcile-stabil). Fallback ohne gml:id: BWNR#TBWNR#Geometrie-Hash — TBWNR trennt die
        // Teilbauwerke/Fahrtrichtungen, die sich BWNR+pos+BWNAME teilen (sonst stiller Upsert-Verlust).
        externeId: gid || `${props.BWNR ?? "bw"}#${tbwnr || "0"}#${stabilHash(lat, lng, props.BWNAME, bw)}`,
        kategorie,
        name: props.BWNAME || `${bw} ${props.STRBEZ ?? ""}`.trim(),
        beschreibung: [props.BWART, props.ORT].filter(Boolean).join(", ") || null,
        lat, lng,
        strassenRef: strkl && strnr ? `${strkl.toUpperCase()}${strnr}` : (props.STRBEZ?.replace(/\s/g, "") ?? null),
        attrs: {}, // kein Traglast-/Höhenfeld im Bauwerke-Layer
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      }))
    }
    log(`${QUELLE}: ${members.length} geladen · ${obstacles.length} Brücke/Tunnel · ${verworfen} verworfen`)
    return { obstacles }
  },
}
