// Connector Quelle 0122: MobiData BW — Verkehrsmeldungen (LMS BW, TIC3-XML).
// Port aus API/Länder/Baden-Württemberg/MobiData-BW-Verkehrsmeldungen-LMS/*.cron.mjs.
// TIC3 ist XML → dependency-freier Regex-Parser. Ein Dokument = GESAMTER aktueller
// Meldungsbestand (Sperrungen/Gefahren, A/B/L/K, WGS84) → vollbestand=true.

import { makeNormalized, getText } from "./_helpers.js"

const QUELLE = "0122"
const QUELLE_NAME = "MobiData BW — Verkehrsmeldungen (LMS BW)"
const QUELLE_URL = "https://mobidata-bw.de/dataset/meldung"
const BASE = "https://api.mobidata-bw.de/datasets/traffic/incidents-bw/TIC3-Meldungen.xml"
const UA = "Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"

function pick(s, re) { const m = s.match(re); return m ? m[1] : null }
function erstZeile(s) { return s ? s.split("\n")[0].trim() || null : null }
function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

export const mobidataBwLmsConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 45000, log = () => {} } = {}) {
    const xml = await getText(BASE, { headers: { "user-agent": UA }, timeoutMs })
    const blocks = (xml ?? "").match(/<TrafficAndTravelEvent>[\s\S]*?<\/TrafficAndTravelEvent>/g) ?? []
    log(`${QUELLE}: ${blocks.length} Meldungen`)

    const obstacles = blocks.map((b) => {
      const ticId = pick(b, /<TicId>([^<]+)<\/TicId>/)
      const dataId = pick(b, /<DataIdentifier>([^<]+)<\/DataIdentifier>/)
      const beschr = decode(pick(b, /<Description><Culture>\d+<\/Culture><Text>([\s\S]*?)<\/Text>/) ?? "").trim() || null
      const roadNr = pick(b, /<RoadNumber>[\s\S]*?<Number>([^<]+)<\/Number>/)
      // Shape-Koordinaten (Latitude/Longitude-Paare) → Referenzpunkt (erstes Paar):
      const coords = [...b.matchAll(/<Coordinate><Latitude>([-\d.]+)<\/Latitude><Longitude>([-\d.]+)<\/Longitude><\/Coordinate>/g)]
        .map((m) => [Number(m[2]), Number(m[1])]) // → [lng, lat]
      const [lng, lat] = coords[0] ?? [null, null]
      const txt = (beschr ?? "").toLowerCase()
      return makeNormalized({
        externeId: dataId ?? ticId,
        kategorie: "sperrung", // LMS = Sperrungen/Gefahren → sperrung-Kategorie
        name: erstZeile(beschr) ?? `Verkehrsmeldung ${roadNr ?? ""}`.trim(),
        beschreibung: beschr,
        lat, lng,
        strassenRef: normRef(roadNr),
        attrs: { vollsperrung: /vollsperr/.test(txt) || undefined },
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    return { obstacles }
  },
}
