// Connector Quelle 0124: GST-Schwertransportkarte NRW — lastbeschränkte/gesperrte Brücken.
// Port aus API/Länder/Nordrhein-Westfalen/gst-schwertransportkarte-nrw/*.cron.mjs.
// Goldstandard-Restriktion NRW (Straßen.NRW + Autobahn GmbH). ArcGIS-REST-FeatureServer,
// f=geojson&outSR=4326 → WGS84-GeoJSON. Live 157 Bauwerke, maxRecordCount=2000 → eine Seite
// reicht, Paging über resultOffset zieht den GESAMTEN Bestand → vollbestand=true.

import { makeNormalized, getJson, tonnageAusText, stabilHash } from "./_helpers.js"

const QUELLE = "0124"
const QUELLE_NAME = "GST-Schwertransportkarte NRW (lastbeschränkte Brücken)"
const QUELLE_URL = "https://www.arcgishostedserver.nrw.de/arcgis/rest/services/Hosted/last_bruecken1/FeatureServer/0"
const LAYER = `${QUELLE_URL}/query`

function normRef(strkl, strnr) {
  if (!strkl || strnr == null) return null
  const k = String(strkl).trim().toUpperCase()
  const n = String(strnr).trim()
  return k && n ? `${k}${n}` : null
}

// Erste verwertbare [lng, lat]-Koordinate aus beliebiger GeoJSON-Geometrie ziehen.
// Toleriert Point/MultiPoint/LineString/Polygon/Multi* (nimmt den ersten Vertex,
// bei Polygon den Ringanfang). KEIN Eintrag soll wegen Geometrie-Form verloren gehen.
function ersteKoordinate(geom) {
  if (!geom) return [null, null]
  const c = geom.coordinates
  if (!Array.isArray(c)) return [null, null]
  let cur = c
  // Bis zur tiefsten Zahlen-Ebene absteigen (jeweils erstes Element).
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  const lng = Number(cur?.[0]), lat = Number(cur?.[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [null, null]
  return [lng, lat]
}

async function ladeAlle({ pageSize = 2000, maxPages = 500, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const url = `${LAYER}?where=1%3D1&outFields=*&outSR=4326&f=geojson` +
      `&resultRecordCount=${pageSize}&resultOffset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data?.features ?? []
    all.push(...feats)
    if (feats.length < pageSize) break
  }
  return all
}

export const gstSchwertransportkarteNrwConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await ladeAlle({ timeoutMs })
    log(`${QUELLE}: ${feats.length} Brücken`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersteKoordinate(f.geometry)
      const gewichtText = String(p.gewicht ?? "")
      const tonnage = tonnageAusText(gewichtText) // "..., max 16 to" → 16
      const komplettsperre = /keine schwertransporte/i.test(gewichtText)
      // EINDEUTIG pro echtem Einzel-Eintrag UND STABIL über Läufe (reconcile-stabil):
      // quellId (tbwnr/fid/f.id) + Diskriminator-Hash aus Geometrie + unterscheidenden
      // Quellfeldern (Straßen-Ref, Restriktionstext). So kollabieren zwei Last-Restriktionen
      // am selben Bauwerk (verschiedene Richtungsfahrbahn/Schild) NICHT auf eine externeId.
      const quellId = (p.tbwnr ?? p.fid ?? f.id)
      const externeId = `${quellId != null ? String(quellId).trim() : "x"}#` +
        stabilHash(lat, lng, p.strkl, p.strnr, gewichtText)
      return makeNormalized({
        externeId,
        kategorie: "bruecke",
        name: p.bw_name || `Brücke ${p.tbwnr ?? ""}`.trim(),
        beschreibung: gewichtText || null,
        lat, lng,
        strassenRef: normRef(p.strkl, p.strnr),
        attrs: {
          maxGewichtT: tonnage,
          grundsaetzlicheGstSperre: komplettsperre || undefined,
        },
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })

    // Eindeutigkeits-Check: distinct externeId muss == Feature-Anzahl sein, sonst stiller Verlust.
    const ids = new Set(obstacles.map((o) => o.externeId))
    if (ids.size !== obstacles.length) {
      log(`${QUELLE}: WARN externeId-Kollision — ${obstacles.length} Features, nur ${ids.size} distinct IDs`)
    }
    return { obstacles }
  },
}
