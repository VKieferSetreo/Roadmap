// Connector Quelle 0115: Berlin VIZ — GeoJSON-Feeds (Verkehrsredaktion + Landesmeldestelle TIC3).
// Port aus API/Länder/Berlin/VIZ-Berlin-GeoJSON-Feeds/viz-berlin-geojson-feeds.cron.mjs.
// Zwei statische GeoJSON-Feeds (1 GET je Feed, EPSG:4326, keine Pagination). Geometrie = Point
// ODER GeometryCollection (Point + LineString). validity = Objekt { from, to } (dd.mm.yyyy [HH:MM]).

import { makeNormalized, getJson, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE_NAME = "Berlin VIZ — GeoJSON-Feeds (Verkehrsredaktion + TIC3)"
const FEEDS = [
  { url: "https://api.viz.berlin.de/daten/baustellen_sperrungen_viz.json", herkunft: "Verkehrsredaktion" },
  { url: "https://api.viz.berlin.de/tic3/baustellen_sperrungen_tic.json", herkunft: "Landesmeldestelle (TIC3)" },
]

function katAus(subtype) {
  const s = String(subtype ?? "").toLowerCase()
  if (s.includes("baustelle") || s.includes("bauarbeit")) return "baustelle"
  if (s.includes("sperrung")) return "sperrung"
  // T-436: Gefahr/Störung/Veranstaltung etc. sind KEINE planbaren Hindernisse → 'sonstige'
  // (Engine schließt 'sonstige' aus). Vorher pauschal 'sperrung' = Falsch-Sperrung. Der echte
  // Sperr-Entscheid kommt aus dem severity-Feld (istVollsperrung), nicht aus dem subtype.
  return "sonstige"
}
// T-436: echtes severity-Feld ("Vollsperrung"/"Fahrtrichtungssperrung"/"keine Sperrung") als
// Sperr-Entscheid; Text-Heuristik (T-432) nur Fallback, falls severity fehlt.
function istVollsperrung(severity, text) {
  const sev = String(severity ?? "").toLowerCase()
  if (sev) return sev.includes("vollsperr") || sev.includes("fahrtrichtungssperr")
  return /vollsperr/i.test(text) || (/gesperrt/i.test(text) && !/fahrstreifen|spur|einzel/i.test(text))
}
function geomPunkt(geometry) {
  if (!geometry) return [null, null]
  const geoms = geometry.type === "GeometryCollection" ? geometry.geometries : [geometry]
  let point = [null, null], line = null
  for (const g of geoms) {
    if (g.type === "Point" && point[0] == null) point = g.coordinates
    if ((g.type === "LineString" || g.type === "MultiLineString") && !line) line = g
  }
  if (point[0] == null && line) { let c = line.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; point = c }
  return point
}
// Volle Linien-Geometrie (für Korridor-Clip + Linien-Render + Gegenfahrbahn-Filter): ALLE LineStrings
// aus der GeometryCollection einsammeln. Feeds sind EPSG:4326 (siehe Kopf) → keine Reprojektion.
// 0 Linien → null (reiner Point), 1 → LineString, ≥2 → MultiLineString.
function geomLinie(geometry) {
  if (!geometry) return null
  const geoms = geometry.type === "GeometryCollection" ? geometry.geometries : [geometry]
  const lines = []
  for (const g of geoms) {
    if (g.type === "LineString") lines.push(g.coordinates)
    else if (g.type === "MultiLineString") lines.push(...g.coordinates)
    // T-435: Flächenmeldungen behalten ihre Geometrie (vorher gingen Polygon/MultiPolygon verloren) — wie 0114.
    else if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates }
    else if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates }
  }
  if (!lines.length) return null
  return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines }
}
function validity(v) {
  if (!v || typeof v !== "object") return { von: null, bis: null }
  return { von: dateOnly(v.from), bis: dateOnly(v.to) }
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const vizBerlinGeojsonFeedsConnector = {
  quelleId: "0115",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const obstacles = []
    for (const { url, herkunft } of FEEDS) {
      const fc = await getJson(url, { timeoutMs })
      const feats = fc?.features ?? []
      log(`${herkunft}: ${feats.length} Features`)
      for (const f of feats) {
        const p = f.properties ?? {}
        const point = geomPunkt(f.geometry)
        const geom = geomLinie(f.geometry)
        const { von, bis } = validity(p.validity)
        const text = [p.section, p.content].filter(Boolean).join(" — ")
        const kat = katAus(p.subtype)
        const tonnage = tonnageAusText(text)
        obstacles.push(makeNormalized({
          externeId: p.id ?? f.id,
          kategorie: tonnage ? "gewicht" : kat,
          name: p.street || p.section || `${p.subtype ?? "Meldung"} Berlin`,
          beschreibung: text || null,
          lat: point[1], lng: point[0],
          strassenRef: refAus(`${p.street ?? ""} ${p.section ?? ""}`),
          attrs: {
            maxGewichtT: tonnage ?? undefined,
            restbreiteM: meterAusText(text, /breite/i) ?? undefined,
            // T-432: bloßes "gesperrt" matcht "Fahrstreifen gesperrt" (Einzelspur) → nur echte
            // Vollsperrung; Spur-/Fahrstreifen-Qualifizierung schließt die Einzelspur aus.
            vollsperrung: istVollsperrung(p.severity, text) || undefined,
          },
          gueltigVon: von, gueltigBis: bis, realerStart: von,
          quelleName: QUELLE_NAME,
          quelleUrl: url,
          geom,
        }))
      }
    }
    return { obstacles }
  },
}
