// Connector Quelle 0122: MobiData BW — Verkehrsmeldungen (LMS BW, TIC3-XML).
// Port aus API/Länder/Baden-Württemberg/MobiData-BW-Verkehrsmeldungen-LMS/*.cron.mjs.
// TIC3 ist XML → dependency-freier Regex-Parser. Ein Dokument = GESAMTER aktueller
// Meldungsbestand (Sperrungen/Gefahren, A/B/L/K, WGS84) → vollbestand=true.

import { makeNormalized, getText, stabilHash } from "./_helpers.js"

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
// Richtungs-Diskriminator: in TIC3 wird EINE Meldung oft je Fahrtrichtung/Teilstück in mehrere
// <TrafficAndTravelEvent>-Blöcke mit DEMSELBEN DataIdentifier gesplittet. From→To + TMC-Richtungscode
// trennen diese Blöcke, damit sie in der externeId nicht kollabieren.
function richtung(b) {
  const ft = b.match(/<Direction>[\s\S]*?<FromName>[\s\S]*?<Text>([^<]*)<\/Text>[\s\S]*?<\/FromName>[\s\S]*?<ToName>[\s\S]*?<Text>([^<]*)<\/Text>/)
  const tmc = pick(b, /<TmcLocation>[\s\S]*?<Direction>(\d+)<\/Direction>/)
  return [ft ? `${ft[1].trim()}->${ft[2].trim()}` : null, tmc].filter(Boolean).join("|") || null
}
// Koordinaten tolerant einsammeln: zuerst exakte <Coordinate>-Paare (Latitude vor Longitude),
// dann — falls keine — JEDES Latitude/Longitude-Paar im Block (ReferencePoint/BoundingBox-Mitte),
// damit per linearer Referenz verortete Blöcke nicht still verloren gehen.
function alleKoords(b) {
  const pairs = [...b.matchAll(/<Coordinate>\s*<Latitude>([-\d.]+)<\/Latitude>\s*<Longitude>([-\d.]+)<\/Longitude>/g)]
    .map((m) => [Number(m[2]), Number(m[1])]) // → [lng, lat]
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
  if (pairs.length) return pairs
  // Fallback: alle Latitude- und Longitude-Tags paarweise (Reihenfolge im TIC3 stets Latitude→Longitude).
  const lats = [...b.matchAll(/<Latitude>([-\d.]+)<\/Latitude>/g)].map((m) => Number(m[1]))
  const lngs = [...b.matchAll(/<Longitude>([-\d.]+)<\/Longitude>/g)].map((m) => Number(m[1]))
  const n = Math.min(lats.length, lngs.length)
  const fb = []
  for (let i = 0; i < n; i++) if (Number.isFinite(lngs[i]) && Number.isFinite(lats[i])) fb.push([lngs[i], lats[i]])
  return fb
}

export const mobidataBwLmsConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 45000, log = () => {} } = {}) {
    const xml = await getText(BASE, { headers: { "user-agent": UA }, timeoutMs })
    const blocks = (xml ?? "").match(/<TrafficAndTravelEvent>[\s\S]*?<\/TrafficAndTravelEvent>/g) ?? []

    const obstacles = blocks.map((b) => {
      const ticId = pick(b, /<TicId>([^<]+)<\/TicId>/)
      const dataId = pick(b, /<DataIdentifier>([^<]+)<\/DataIdentifier>/)
      const beschr = decode(pick(b, /<Description><Culture>\d+<\/Culture><Text>([\s\S]*?)<\/Text>/) ?? "").trim() || null
      const roadNr = pick(b, /<RoadNumber>[\s\S]*?<Number>([^<]+)<\/Number>/)
      // Koordinaten tolerant (Shape-Paare, sonst beliebiges Lat/Lng-Paar) → Referenzpunkt (erstes Paar):
      const coords = alleKoords(b)
      const [lng, lat] = coords[0] ?? [null, null]
      // Volle Strecken-Geometrie als geom durchreichen (Korridor-Clip / Linien-Render /
      // Gegenfahrbahn-Filter). alleKoords liefert bereits [lng,lat] in WGS84 (TIC3 ist WGS84,
      // KEINE UTM-Reprojektion nötig) → direkt als LineString. Ab 2 Punkten; sonst Punkt-only.
      const geom = coords.length >= 2 ? { type: "LineString", coordinates: coords } : null
      const txt = (beschr ?? "").toLowerCase()
      // externeId STABIL + EINDEUTIG: Quell-ID + deterministischer Diskriminator-Hash. Verhindert,
      // dass je-Richtung/-Teilstück gesplittete Blöcke mit gleichem DataIdentifier sich beim Upsert
      // auf (quelle, externe_id) gegenseitig überschreiben (stiller Datenverlust).
      const externeId = `${dataId ?? ticId ?? "x"}#${stabilHash(lat, lng, normRef(roadNr), richtung(b), erstZeile(beschr))}`
      return makeNormalized({
        externeId,
        kategorie: "sperrung", // LMS = Sperrungen/Gefahren → sperrung-Kategorie
        name: erstZeile(beschr) ?? `Verkehrsmeldung ${roadNr ?? ""}`.trim(),
        beschreibung: beschr,
        lat, lng,
        strassenRef: normRef(roadNr),
        attrs: { vollsperrung: /vollsperr/.test(txt) || undefined },
        geom,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    const ohneKoord = obstacles.filter((o) => o.lat == null || o.lng == null).length
    log(`${QUELLE}: ${blocks.length} Meldungen · ${blocks.length - ohneKoord} mit Koord · ${ohneKoord} ohne Koord`)
    return { obstacles }
  },
}
