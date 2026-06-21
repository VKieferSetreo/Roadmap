// Connector Quelle 0114: Berlin VIZ — Baustellen/Sperrungen/Störungen (mdhwfs).
// Port aus API/Länder/Berlin/VIZ-Berlin-Baustellen-WFS/viz-berlin-baustellen.cron.mjs.
// GeoServer WFS 2.0, GeoJSON, EPSG:4326 (keine Reprojektion). Geometrie = GeometryCollection
// (Point + optional LineString). validity = JSON-String { from, to } (dd.mm.yyyy [HH:MM]).

import { makeNormalized, fetchAllFeatures, dateOnly, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "Berlin VIZ — Baustellen/Sperrungen/Störungen (mdhwfs)"
const QUELLE_URL = "https://daten.berlin.de/datensaetze?groups=verkehr"
const BASE =
  "https://api.viz.berlin.de/geoserver/mdhwfs/wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=mdhwfs:baustellen_sperrungen&outputFormat=application/json&srsName=EPSG:4326"

function katAus(subtype) {
  const s = String(subtype ?? "").toLowerCase()
  if (s.includes("baustelle") || s.includes("bauarbeit")) return "baustelle"
  if (s.includes("sperrung")) return "sperrung"
  // T-436: Gefahr/Störung/Veranstaltung etc. sind KEINE planbaren Hindernisse → 'sonstige'
  // (Engine schließt 'sonstige' aus). Vorher pauschal 'sperrung' = Falsch-Sperrung (live: subtype
  // "Störung" mit severity "keine Sperrung"). Sperr-Entscheid kommt aus severity (istVollsperrung).
  return "sonstige"
}
// T-436: echtes severity-Feld als Sperr-Entscheid; Text-Heuristik (T-432) nur Fallback.
function istVollsperrung(severity, text) {
  const sev = String(severity ?? "").toLowerCase()
  if (sev) return sev.includes("vollsperr") || sev.includes("fahrtrichtungssperr")
  return /vollsperr/i.test(text) || (/gesperrt/i.test(text) && !/fahrstreifen|spur|einzel/i.test(text))
}
// Erste plausible [lng,lat]-Koordinate aus einer beliebig tief verschachtelten
// Geometrie ziehen (Point/MultiPoint/LineString/MultiLineString/Polygon/MultiPolygon).
// Rettet Koords statt Einträge wegen fehlender Geometrie zu verlieren.
function ersteKoord(c) {
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? c : null
}
function geomPunkt(geometry) {
  if (!geometry) return [null, null]
  const geoms = geometry.type === "GeometryCollection" ? (geometry.geometries ?? []) : [geometry]
  // 1. Bevorzugt einen echten Point nehmen (genauester Ortsbezug).
  for (const g of geoms) {
    if (g?.type === "Point") { const c = ersteKoord(g.coordinates); if (c) return c }
  }
  // 2. Sonst aus IRGENDEINER vorhandenen Geometrie den ersten Stützpunkt retten
  //    (Line/Polygon/Multi* — kein Eintrag soll mangels Point verloren gehen).
  for (const g of geoms) {
    if (!g?.coordinates) continue
    const c = ersteKoord(g.coordinates)
    if (c) return c
  }
  return [null, null]
}
// Volle Linien-/Flächen-Geometrie aus der GeometryCollection ziehen (Quelle ist EPSG:4326 →
// KEINE Reprojektion, identisch zum Punkt-Pfad). Eine GC trägt 0..n LineStrings (+ einen Point):
// einer → LineString, mehrere → MultiLineString. So bleiben Korridor-Clip, Linien-Render und
// Gegenfahrbahn-Filter erhalten, statt die Strecke auf einen Pin zu reduzieren.
function geomLinie(geometry) {
  if (!geometry) return null
  const geoms = geometry.type === "GeometryCollection" ? (geometry.geometries ?? []) : [geometry]
  const lines = []
  for (const g of geoms) {
    if (!g?.coordinates) continue
    if (g.type === "LineString") lines.push(g.coordinates)
    else if (g.type === "MultiLineString") lines.push(...g.coordinates)
    else if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates }
    else if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates }
  }
  if (lines.length === 1) return { type: "LineString", coordinates: lines[0] }
  if (lines.length > 1) return { type: "MultiLineString", coordinates: lines }
  return null
}
function validity(v) {
  if (!v) return { von: null, bis: null }
  try { const o = typeof v === "string" ? JSON.parse(v) : v; return { von: dateOnly(o.from), bis: dateOnly(o.to) } }
  catch { return { von: null, bis: null } }
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const vizBerlinBaustellenConnector = {
  quelleId: "0114",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    // Pagination NICHT kappen: fetchAllFeatures terminiert via numberMatched; maxPages ist nur
    // ein hoher Sicherheits-Backstop (log warnt, falls er je erreicht wird). Kein stiller Cap mehr.
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 500, timeoutMs, log })
    log(`VIZ-Berlin-Baustellen: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const point = geomPunkt(f.geometry)
      const geom = geomLinie(f.geometry) // EPSG:4326 → unverändert durchreichen (keine Reprojektion)
      const { von, bis } = validity(p.validity)
      const text = [p.section, p.content].filter(Boolean).join(" — ")
      const kat = katAus(p.subtype)
      const tonnage = tonnageAusText(text)
      // externeId: eindeutig pro echtem Einzel-Eintrag UND deterministisch/reconcile-stabil.
      // Quell-id allein ist nicht garantiert eindeutig; (lat,lng) allein würde zwei Meldungen am
      // selben Ort (je Richtung/Teilstück/Phase) kollabieren lassen. Daher Quell-id als Basis-
      // Diskriminator + Hash über Ort UND unterscheidende Quellfelder (subtype/Richtung-Phase,
      // section, Gültigkeit von/bis, street). Kein Array-Index, kein Zufall → stabil über Läufe.
      const quellId = p.id ?? f.id
      const externeId = `${quellId ?? "x"}#${stabilHash(point[1], point[0], p.subtype, p.section, von, bis, p.street)}`
      obstacles.push(makeNormalized({
        externeId,
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
          // T-433: strukturiertes direction-Feld ("Beidseitig"/"None", live verifiziert) als boolean-attr
          // (NICHT richtung-Spalte = NOT-NULL-CHECK-Enum; makeNormalized behält nur number|boolean).
          richtungBeidseitig: /beid/i.test(String(p.direction ?? "")) || undefined,
        },
        gueltigVon: von, gueltigBis: bis, realerStart: von,
        geom,
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
