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

// T-611: Klassen-Rang für „tragende Straße"-Präferenz (Autobahn > Bundes- > Landes- > Kreisstraße);
// die höhere Klasse ist die maßgebliche Hauptstraße, nicht ein minderklassiger Kreuzungs-/Auffahrt-Ref.
const KLASSEN_RANG = { A: 4, B: 3, L: 2, K: 1 }
// T-611: Buchstabensuffix (z.B. B96A) mitnehmen, führende Nullen (B096→B96) strippen und bei mehreren
// Refs die tragende (höchste Klasse) bevorzugen.
function refAus(s) {
  let best = null
  for (const m of String(s ?? "").matchAll(/\b([ABLK])\s?0*(\d{1,4})([a-zA-Z])?\b/g)) {
    const ref = `${m[1]}${m[2]}${m[3] ? m[3].toUpperCase() : ""}`
    const rang = KLASSEN_RANG[m[1]] ?? 0
    if (!best || rang > best.rang) best = { ref, rang }
  }
  return best ? best.ref : null
}
// T-611: bloßer Klassenbuchstabe ohne Nummer (z.B. „G"/„g" = Gemeindestraße) ist kein verwertbarer
// Straßen-Ref → null statt rohem Buchstaben durchreichen.
function strasseRoh(s) { const v = String(s ?? "").trim(); return v && !/^[a-zA-Z]$/.test(v) ? v : null }
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
      // typ=N = "Sperrung für LKW" (strukturiertes RLP-Vokabular, am Feed verifiziert) → eine
      // LKW-Sperre blockiert den Schwertransport → vollsperrung. Plus der Freitext-Vollsperr-Fall.
      const lkwSperre = p.typ === "N" || /für lkw/i.test(text)
      const vollsperrung = /vollsperr/i.test(text) || lkwSperre || undefined
      return makeNormalized({
        externeId: f.id, // kein eigenes ID-Property → Feature-Level f.id
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.art_der_arbeiten || (vollsperrung ? "Sperrung" : "Baustelle"),
        beschreibung: p.beschreibung || null,
        lat, lng,
        strassenRef: refAus(p.strasse) ?? strasseRoh(p.strasse),
        attrs: { maxGewichtT: tonnage, restbreiteM: meterAusText(text, /breite|einengung/i), vollsperrung },
        gueltigVon: dateOnly(p.von), gueltigBis: dateOnly(p.bis), realerStart: dateOnly(p.von),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} RLP-Maßnahmen`)
    return { obstacles }
  },
}
