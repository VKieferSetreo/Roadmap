// Connector Quelle 0117: Straßenbaustellen Schleswig-Holstein (LBV.SH / GDI-SH).
// Port aus API/Länder/Schleswig-Holstein/OpenData-SH-Strassenbaustellen-DATEX/baustellen-sh.cron.mjs.
// ArcGIS-WFS 2.0, GeoJSON, EPSG:4326 nativ. ~1137 Baustellen. Strukturierte Grenzwerte:
// Gewichtsbeschränkung_in_t, Verbleibende_Restbreite_in_m, Länge_in_m. Datum "von bis" → dateOnly.

import { makeNormalized, fetchAllFeatures, dateOnly, num } from "./_helpers.js"

const QUELLE_NAME = "Straßenbaustellen Schleswig-Holstein (LBV.SH / GDI-SH)"
const QUELLE_URL = "https://www.govdata.de/daten/-/details/strassenbaustellen-schleswig-holsteinf229d"
const BASE =
  "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen?Service=WFS&Version=2.0.0&Request=GetFeature" +
  "&typeNames=Baustelleninformationen:Baustellen_SH&outputFormat=GEOJSON&srsName=EPSG:4326"

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}
// "2026-03-02 23:00:00 bis 2027-11-12 22:59:00" → {von, bis}
function dauer(s) {
  if (!s) return { von: null, bis: null }
  const teile = String(s).split(/\s+bis\s+/i)
  return { von: dateOnly(teile[0]), bis: dateOnly(teile[1] ?? teile[0]) }
}
function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const baustellenShConnector = {
  quelleId: "0117",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 3, timeoutMs })
    log(`SH-Baustellen: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      const { von, bis } = dauer(p.Dauer_der_Bauphase)
      const gewicht = num(p.Gewichtsbeschränkung_in_t)
      const text = [p.Verkehrseinschränkung, p.Art_der_Maßnahme, p.Hinweise_zur_Verkehrsführung].filter(Boolean).join(" — ")
      obstacles.push(makeNormalized({
        externeId: p.OBJECTID ?? f.id,
        kategorie: gewicht ? "gewicht" : "baustelle",
        name: `Baustelle ${p.Straßenname ?? ""} (${p.Art_der_Maßnahme ?? "Bauarbeiten"})`.trim(),
        beschreibung: text || null,
        lat, lng,
        strassenRef: refAus(p.Straßenname) ?? (p.Straßenname || null),
        attrs: {
          restbreiteM: num(p.Verbleibende_Restbreite_in_m) ?? undefined,
          maxGewichtT: gewicht ?? undefined,
          sperrlaengeM: num(p.Länge_in_m) ?? undefined, // einheitlicher Key (FE-Label "Länge der Maßnahme")
          vollsperrung: /vollsperr|gesperrt|durchgangsverkehr.*gesperrt/i.test(text) || undefined,
        },
        gueltigVon: von, gueltigBis: bis, realerStart: von,
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
