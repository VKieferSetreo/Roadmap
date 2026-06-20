// Connector Quelle 0127: baustellen.saarland (LfS) — Baustellen, Sperrungen, Verkehrsmeldungen.
// Port aus API/Länder/Saarland/baustellen-saarland-lfs/*.cron.mjs.
// Offene GeoJSON-Feeds (WGS84). Punkt-Feeds (roadworks + verkehrsmeldungen) liefern den
// GESAMTEN aktuellen Bestand als Referenzpunkt → vollbestand=true. Der NormalizedObstacle-
// Vertrag führt keine Linien-Geometrie → nur der Punkt (lat/lng) wird übernommen.

import { makeNormalized, getJson, dateOnly, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

const QUELLE = "0127"
const QUELLE_NAME = "baustellen.saarland (Landesbetrieb für Straßenbau)"
const QUELLE_URL = "https://baustellen.saarland/"
const BASE = "https://baustellen.saarland/data"
const FEEDS = {
  rwPoint: `${BASE}/baustellen/roadworks_point_geojson.geojson`,
  // T-431: Linien-Geometrie der Baustellen (gleiche Records wie rwPoint, je recordid). vmLine
  // bietet die Quelle nicht mehr an (404) → nur roadworks hat eine Linien-Variante.
  rwLine: `${BASE}/baustellen/roadworks_line_geojson.geojson`,
  vmPoint: `${BASE}/verkehrsmeldungen/traffic_messages_point_geojson.geojson`,
}

function stripHtml(s) { return String(s).replace(/<[^>]*>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim() }
function erstZeile(s) { return s ? s.split("\n").map((x) => x.trim()).find(Boolean) ?? null : null }
function normRef(s) {
  if (!s) return null
  const m = String(s).toUpperCase().match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}

export const baustellenSaarlandConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 30000, log = () => {} } = {}) {
    const feats = async (url) => {
      const data = await getJson(url, { timeoutMs })
      return data?.features ?? []
    }
    const [rwP, rwL, vmP] = await Promise.all([
      feats(FEEDS.rwPoint), feats(FEEDS.rwLine), feats(FEEDS.vmPoint),
    ])
    // T-431: Linien-geom je recordid indexieren → an die Punkt-Funde mergen (sonst Punkt statt Strecke).
    const lineByRec = new Map()
    for (const f of rwL) {
      const rec = f.properties?.recordid
      if (rec && (f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString")) {
        lineByRec.set(rec, f.geometry)
      }
    }
    log(`${QUELLE}: roadworks=${rwP.length} (${lineByRec.size} mit Linie) · verkehrsmeldungen=${vmP.length}`)

    const obstacles = [...rwP.map((f) => ["baustelle", f]), ...vmP.map((f) => ["meldung", f])].map(([herkunft, f]) => {
      const p = f.properties ?? {}
      const [lng, lat] = f.geometry?.coordinates ?? [null, null] // Punkt-Feed: WGS84 [lng,lat]
      const text = stripHtml(p.description ?? "")
      const istSperrung = String(p.roadclosed) === "true"
      const tonnage = tonnageAusText(text)
      // Eindeutige, reconcile-stabile externeId: Quell-ID (recordid/f.id) ist nicht garantiert eindeutig
      // (null oder Dublette je Fahrtrichtung/Teilstück/Phase am selben Ort) → würde beim Upsert auf
      // (quelle, externe_id) Datensätze still überschreiben. Deterministisches Suffix aus Geometrie +
      // unterscheidenden Quellfeldern (Herkunft, Strasse, von/bis-Datum, Sperr-Phase, erste Beschreibungszeile)
      // hält run-zu-run stabil und trennt zwei Meldungen am selben Punkt sauber auf.
      const externeId = `${p.recordid ?? f.id ?? herkunft}#${stabilHash(
        lat, lng, herkunft, p.roadname, p.starttime, p.endtime, p.roadclosed, erstZeile(text),
      )}`
      return makeNormalized({
        externeId,
        kategorie: tonnage ? "gewicht" : istSperrung ? "sperrung" : herkunft === "baustelle" ? "baustelle" : "sperrung",
        name: erstZeile(text) ?? p.roadname ?? (istSperrung ? "Sperrung" : "Baustelle"),
        beschreibung: text || null,
        lat, lng,
        geom: lineByRec.get(p.recordid) ?? null, // T-431: Linie aus rwLine je recordid
        strassenRef: normRef(text) ?? normRef(p.roadname),
        attrs: {
          maxGewichtT: tonnage,
          restbreiteM: meterAusText(text, /breite|einengung/i),
          vollsperrung: istSperrung || undefined,
        },
        realerStart: dateOnly(p.starttime),
        gueltigVon: dateOnly(p.starttime),
        gueltigBis: dateOnly(p.endtime),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    return { obstacles }
  },
}
