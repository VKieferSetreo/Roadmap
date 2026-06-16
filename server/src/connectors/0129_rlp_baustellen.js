// Connector Quelle 0129: Rheinland-Pfalz — Baustellen/Sperrungen (Mobilitätsatlas RLP, MWVLW).
// WFS 2.0 GeoJSON, EPSG:4326 (native, KEINE Reprojektion). Landesweiter Bestand B/L/K bis auf
// Gemeindeebene (geplant + laufend). Lizenz: Datenlizenz Deutschland (frei), keine Gebühr/Zugangs-
// beschränkung laut Capabilities. Namensnennung „Verkehrsbehörden in Rheinland-Pfalz".
//
// WICHTIG: Der Layer mwvlw:baustelle ist MULTI-MANDANT (auch Autobahn GmbH/BW/Karlsruhe). Pflicht-
// Filter CQL_FILTER quelle='Verkehrsbehörden in Rheinland-Pfalz', sonst Doppel-Import mit 0001/0128.

import { makeNormalized, fetchAllFeatures, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE = "0129"
const QUELLE_NAME = "Mobilitätsatlas RLP — Baustellen (MWVLW Rheinland-Pfalz)"
const QUELLE_URL = "https://www.mobilitaetsatlas.rlp.de/"
const CQL = encodeURIComponent("quelle='Verkehrsbehörden in Rheinland-Pfalz'")
const BASE = "https://maps.mobilitaetsatlas.de/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature" +
  `&typeNames=mwvlw:baustelle&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=${CQL}`

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
function ersterPunkt(geom) {
  if (!geom?.coordinates) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null] // bereits WGS84 [lng,lat]
}

export const rlpBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 50, timeoutMs, log })
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      const text = [p.art_der_arbeiten, p.beschreibung].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      const vollsperrung = /vollsperr/i.test(text) || undefined
      return makeNormalized({
        externeId: f.id, // kein eigenes ID-Property → Feature-Level f.id
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.art_der_arbeiten || (vollsperrung ? "Sperrung" : "Baustelle"),
        beschreibung: p.beschreibung || null,
        lat, lng,
        strassenRef: refAus(p.strasse) ?? (p.strasse || null),
        attrs: { maxGewichtT: tonnage, restbreiteM: meterAusText(text, /breite|einengung/i), vollsperrung },
        gueltigVon: dateOnly(p.von), gueltigBis: dateOnly(p.bis), realerStart: dateOnly(p.von),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} RLP-Maßnahmen`)
    return { obstacles }
  },
}
