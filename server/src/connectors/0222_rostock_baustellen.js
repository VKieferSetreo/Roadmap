// Connector Quelle 0222: Rostock — Baustellen (OpenData.HRO).
// Port aus rostock-baustellen.cron.mjs. Statisches GeoJSON (geo.sv.rostock.de, WGS84), ganzer
// Datensatz in einem Abruf. Schema defensiv über mehrere Schlüssel gemappt.

import { makeNormalized, getJson, ersterPunkt, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://www.opendata-hro.de/dataset/baustellen"
const QUELLE_NAME = "Rostock — Baustellen (OpenData.HRO)"
const URL = "https://geo.sv.rostock.de/download/opendata/baustellen/baustellen.json"

export const rostockBaustellenConnector = {
  quelleId: "0222",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Statisches Voll-GeoJSON → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const data = await getJson(URL, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const strasse = p.strasse_name ?? p.strasse ?? p.adresse ?? p.lage ?? p.bezeichnung ?? null
      const massnahme = p.baumassnahme ?? p.massnahme ?? p.art ?? null
      const sperrInfo = p.verkehrsbeeintraechtigungen ?? p.verkehrsbeeintraechtigung ?? p.beeintraechtigung ?? p.sperrung ?? p.einschraenkung ?? null
      const text = [massnahme, sperrInfo, p.bemerkung, p.beschreibung].filter(Boolean).join(" ")
      const vollsperrung = /vollsperrung|voll gesperrt/i.test(text) || undefined
      const istSperrung = /sperrung|gesperrt/i.test(String(sperrInfo ?? ""))
      const [lng, lat] = ersterPunkt(f.geometry)
      obstacles.push(makeNormalized({
        externeId: p.uuid ?? p.id ?? p.objectid ?? f.id,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: strasse ?? massnahme ?? "Baustelle Rostock",
        beschreibung: [massnahme, sperrInfo].filter(Boolean).join(" — ").trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          vollsperrung,
          restbreiteM: meterAusText(text, /breite/i),
          maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
          maxGewichtT: tonnageAusText(text),
        },
        realerStart: dateOnly(p.baubeginn ?? p.von ?? p.beginn),
        gueltigVon: dateOnly(p.baubeginn ?? p.von ?? p.beginn),
        gueltigBis: dateOnly(p.bauende ?? p.bis ?? p.ende),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Rostock: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
