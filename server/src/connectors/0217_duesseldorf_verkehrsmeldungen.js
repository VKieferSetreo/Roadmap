// Connector Quelle 0217: Düsseldorf — Verkehrsmeldungen (statisches GeoJSON, DATEX-II-Schema).
// Port aus duesseldorf-verkehrsmeldungen.cron.mjs. Eine statische, regelmäßig regenerierte
// GeoJSON-Datei (Point, EPSG:4326, DATEX-II-Properties) → ein Voll-Abruf.

import { makeNormalized, getJson, ersterPunkt, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://opendata.duesseldorf.de/dataset/verkehrsmeldungen-mobilitätsdaten"
const QUELLE_NAME = "Düsseldorf — Verkehrsmeldungen (DATEX-II Mobilitätsdaten)"
const URL =
  "https://opendata.duesseldorf.de/sites/default/files/publ-2056000_Verkehrsmeldungen_Geodaten.geojson"

// roadNumber bei Düsseldorf ist eine interne Netz-ID (z.B. 1027) — keine A/B/L/K-Klasse → null.
function refAusNummer(n) {
  const s = String(n ?? "").trim().toUpperCase()
  return /^[ABLK]\s?\d{1,4}$/.test(s) ? s.replace(/\s/, "") : null
}

export const duesseldorfVerkehrsmeldungenConnector = {
  quelleId: "0217",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Statische Voll-Datei → kompletter aktueller Bestand bei jedem Lauf.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const data = await getJson(URL, { timeoutMs, headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-connector/1.0)" } })
    const feats = data?.features ?? []
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const recType = String(p.situationRecord_type ?? "")
      const constr = String(p.trafficConstrictionType ?? "")
      const mgmt = String(p.roadOrCarriagewayOrLaneManagementType ?? "")
      const istSperrung = /roadClosed|roadBlocked/i.test(mgmt) || /roadBlocked/i.test(constr)
      const vollsperrung = /roadClosed/i.test(mgmt) || (constr === "roadBlocked") || undefined
      const [lng, lat] = ersterPunkt(f.geometry)
      obstacles.push(makeNormalized({
        externeId: `${p.roadName ?? ""}-${p.overallStartTime ?? ""}-${f.geometry?.coordinates?.join(",")}`,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: p.roadName ?? recType ?? "Verkehrsmeldung Düsseldorf",
        beschreibung: p.comment ?? null,
        lat, lng,
        strassenRef: p.roadNumber ? refAusNummer(p.roadNumber) : null,
        attrs: {
          numberOfLanesRestricted: p.numberOfLanesRestricted ?? undefined,
          vollsperrung,
          restbreiteM: meterAusText(p.comment, /breite/i),
          maxHoeheM: meterAusText(p.comment, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(p.comment),
        },
        realerStart: dateOnly(p.overallStartTime),
        gueltigVon: dateOnly(p.overallStartTime),
        gueltigBis: dateOnly(p.overallEndTime),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Düsseldorf: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
