// Connector Quelle 0213: Dresden — Verkehrseinschränkungen (Themenstadtplan / kommisdd OGC API).
// Port aus dresden-opendata-themenstadtplan.cron.mjs. L60 "aktuelle" + L150 "zukünftige"
// (OGC API Features / WFS3, GeoJSON EPSG:4326, LineString). Pagination via limit/offset.

import { makeNormalized, fetchAllFeatures, ersterPunkt, tonnageAusText, meterAusText, dateOnly, stabilHash } from "./_helpers.js"

const PORTAL = "https://opendata.dresden.de/"
const QUELLE_NAME = "Dresden — Verkehrseinschränkungen (Themenstadtplan, kommisdd OGC API)"
const COLLECTIONS = [
  { id: "L60", label: "aktuell" },
  { id: "L150", label: "zukünftig" },
]

export const dresdenVerkehrseinschraenkungenConnector = {
  quelleId: "0213",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Beide Collections voll paginiert → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const HEAD = { headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-connector/1.0)" } }
    const obstacles = []
    for (const col of COLLECTIONS) {
      const base = `https://kommisdd.dresden.de/net4/public/ogcapi/collections/${col.id}/items?f=json`
      // maxPages nur als hoher Sicherheits-Backstop — fetchAllFeatures paginiert bereits bis
      // numberMatched. Ein niedriger Cap (war 10 → max. 10000) würde den Bestand still abschneiden.
      const feats = await fetchAllFeatures(base, { mode: "ogcapi", pageSize: 1000, maxPages: 500, timeoutMs, log, ...HEAD })
      for (const f of feats) {
        const p = f.properties ?? {}
        const typ = String(p.typ ?? "")
        const grund = String(p.sperrgrund_format ?? "")
        const istVoll = /vollsperrung|gesperrt/i.test(typ) && !/halbseitig|fahrstreifen/i.test(typ)
        const [lng, lat] = ersterPunkt(f.geometry)
        obstacles.push(makeNormalized({
          // staid/f.id teils dublett über die Pages UND staid selbst nicht eindeutig (71 Gruppen
          // mit 2-3 echten, verschiedenen Maßnahmen am selben Ort). Nur (lat,lng) reicht NICHT:
          // ersterPunkt liefert nur den Start-Vertex des LineString → alle Duplikat-Gruppen teilen
          // ihn → Kollision → stiller last-wins-Verlust beim Upsert auf (quelle, externe_id). Daher
          // gehen volle Geometrie + Zeitraum + Sperrgrund/Typ in den Diskriminator-Hash (stabil/
          // deterministisch über Läufe, reconcile-fest — kein Index, kein Zufall).
          externeId: `${col.id}-${p.staid ?? f.id ?? "x"}#${stabilHash(
            JSON.stringify(f.geometry?.coordinates ?? []),
            p.datum_von_format ?? p.datum_von,
            p.datum_bis_format ?? p.datum_bis,
            typ,
            grund,
          )}`,
          kategorie: istVoll ? "sperrung" : "baustelle",
          name: grund || typ || "Verkehrseinschränkung Dresden",
          beschreibung: [typ, grund].filter(Boolean).join(" — ").trim() || null,
          lat, lng,
          strassenRef: null,
          attrs: {
            vollsperrung: istVoll || undefined,
            restbreiteM: meterAusText(typ + " " + grund, /breite/i),
            maxGewichtT: tonnageAusText(typ + " " + grund),
          },
          realerStart: dateOnly(p.datum_von_format ?? p.datum_von),
          gueltigVon: dateOnly(p.datum_von_format ?? p.datum_von),
          gueltigBis: dateOnly(p.datum_bis_format ?? p.datum_bis),
          quelleName: QUELLE_NAME,
          quelleUrl: PORTAL,
        }))
      }
      log(`Dresden/${col.id} (${col.label}): ${feats.length} Features`)
    }
    return { obstacles }
  },
}
