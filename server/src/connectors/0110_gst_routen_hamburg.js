// Connector Quelle 0110: GST-Routen Hamburg (Großraum-/Schwertransport-Netz, LBV/LGV).
// Port aus API/Länder/Hamburg/GST-Routen-Hamburg/gst-routen-hamburg.cron.mjs.
// OGC API Features, GeoJSON, EPSG:4326 (keine Reprojektion). ~3892 Kanten. Positiv-Korridor:
// jede Kante = gewidmete GST-Strecke → kategorie sperrung (neutraler Träger), gstRoute=true in attrs.

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE_NAME = "GST-Routen Hamburg (Großraum-/Schwertransport-Netz, LBV/LGV)"
const QUELLE_URL = "https://suche.transparenz.hamburg.de/dataset/grossraum-und-schwertransport-routen-in-hamburg12"
const COLL =
  "https://api.hamburg.de/datasets/v1/grossraum_und_schwertransport_routen" +
  "/collections/grossraum_schwertransport_netz/items"
const LIMIT = 1000
const MAX_PAGES = 6 // 3892/1000 → 4 reichen; etwas Puffer

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function refAus(p) {
  const s = `${p.strassenname ?? ""} ${p.wegenummer ?? ""}`
  const m = s.match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

export const gstRoutenHamburgConnector = {
  quelleId: "0110",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await getJson(`${COLL}?f=json&limit=${LIMIT}&offset=${page * LIMIT}`, { timeoutMs })
      const fs = data?.features ?? []
      feats.push(...fs)
      if (fs.length < LIMIT) break
    }
    log(`GST-Netz-Kanten: ${feats.length} gezogen`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      // Quelle ist EPSG:4326 (keine Reprojektion, wie auch der Punkt-Pfad oben) → GeoJSON-Linie
      // unverändert als geom durchreichen, damit Korridor-Clip/Linien-Render/Gegenfahrbahn greifen.
      const gt = f.geometry?.type
      const geom = gt === "LineString" || gt === "MultiLineString" ? f.geometry : null
      obstacles.push(makeNormalized({
        externeId: f.id,
        kategorie: "sperrung",
        name: p.strassenname ?? `GST-Route ${p.wegenummer ?? f.id}`,
        beschreibung: p.wegeart ? `${p.wegeart}${p.geschwindigkeit ? ` · ${p.geschwindigkeit}` : ""}` : null,
        lat, lng,
        strassenRef: refAus(p),
        attrs: {
          gstRoute: true,
          fahrstreifen: p.fahrstreifenanzahl_in_stationierungsrichtung ?? undefined,
        },
        geom,
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
