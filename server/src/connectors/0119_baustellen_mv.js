// Connector Quelle 0119: Straßenbaustellen Mecklenburg-Vorpommern (LS M-V / SBV).
// Port aus API/Länder/Mecklenburg-Vorpommern/LS-MV-Strassenbaustellen-WFS/baustellen-mv.cron.mjs.
// WFS 2.0, GeoJSON, EPSG:25833 (UTM Zone 33N!) → utmZuWgs84(e,n,33). ~107 Baustellen.
// LIZENZ: AccessConstraints "Urheberrecht" — kommerzielle Nutzung mit LS M-V klären.

import { makeNormalized, getJson, utmZuWgs84, dateOnly, tonnageAusText, meterAusText, num, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "Straßenbaustellen Mecklenburg-Vorpommern (LS M-V / SBV)"
const QUELLE_URL = "https://www.geoportal-mv.de/portal/Geowebdienste/Fachthemen/Verkehr"
const BASE = "https://www.geodaten-mv.de/dienste/wfs_baustellenmv?service=WFS&version=2.0.0&request=GetFeature&typeNames=baustellen:Baustellen"
const OUT = "&outputFormat=" + encodeURIComponent("application/json; subtype=geojson")
const PAGE = 1000, MAX_PAGES = 5

function ersterPunktReproj(geom) {
  if (!geom) return [null, null]
  const istUtm = (x) => Math.abs(x) > 1000
  const mapCoords = (c) => (Array.isArray(c[0]) ? c.map(mapCoords) : (istUtm(c[0]) ? utmZuWgs84(c[0], c[1], 33) : c))
  const coords = mapCoords(geom.coordinates)
  let c = coords
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const baustellenMvConnector = {
  quelleId: "0119",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await getJson(`${BASE}${OUT}&count=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs })
      const fs = data?.features ?? []
      feats.push(...fs)
      if (fs.length < PAGE) break
    }
    log(`MV-Baustellen: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunktReproj(f.geometry)
      const text = [p.sperrart, p.erlaeuterung, p.verkehrslenkung, p.anderemassnahmen].filter(Boolean).join(" — ")
      const tonnage = tonnageAusText(text)
      obstacles.push(makeNormalized({
        // gid/f.id teils leer → Geometrie-Suffix gegen Upsert-Kollision (gleicher bsname mehrfach).
        externeId: `${p.gid ?? f.id ?? p.bsname ?? "bs"}#${stabilHash(lat, lng)}`,
        kategorie: tonnage ? "gewicht" : "baustelle",
        name: p.bsname || `Baustelle ${p.vonort ?? ""}`,
        beschreibung: text || null,
        lat, lng,
        strassenRef: refAus(`${p.bsname ?? ""} ${p.vonort ?? ""}`),
        attrs: {
          maxGewichtT: tonnage ?? undefined,
          restbreiteM: meterAusText(text, /breite/i) ?? undefined,
          sperrlaengeM: num(p.sperrlaenge) ?? undefined,
          vollsperrung: /vollsperr/i.test(`${p.erlaeuterung ?? ""}${p.sperrart ?? ""}`) || undefined,
        },
        gueltigVon: dateOnly(p.baubeginn), gueltigBis: dateOnly(p.bauende), realerStart: dateOnly(p.baubeginn),
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
