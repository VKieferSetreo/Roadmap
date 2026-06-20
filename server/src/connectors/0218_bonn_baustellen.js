// Connector Quelle 0218: Bonn — Baustellen (stadtplan.bonn.de GeoJSON ?Thema=).
// Port aus bonn-baustellen-stadtplan.cron.mjs. Tagesaktuelle Baustellen (Thema=14403,
// GeoJSON Point EPSG:4326), ganzer Datensatz in einem Abruf.

import { makeNormalized, getJson, ersterPunkt, dateOnly, stabilHash } from "./_helpers.js"

const PORTAL = "https://opengeodata-bonn.de/baustellen-tagesaktuell-mit-ortsangabe-bonn/"
const QUELLE_NAME = "Bonn — Baustellen (stadtplan.bonn.de)"
const URL = "https://stadtplan.bonn.de/geojson?Thema=14403"

// "Hermann-Wandersleb-Ring (B56)" → "B56"
function refAusBezeichnung(b) {
  const m = String(b ?? "").match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}

export const bonnBaustellenConnector = {
  quelleId: "0218",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Tagesaktueller Voll-Datensatz in einem Abruf.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const data = await getJson(URL, { timeoutMs, headers: { "user-agent": "Mozilla/5.0 (compatible; roadmap-connector/1.0)" } })
    const feats = data?.features ?? []
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const sperrung = String(p.sperrung ?? "")
      const massnahme = String(p.massnahme ?? "")
      // T-454 (live-kalibriert an echten Werten): nur eine ECHTE KFZ-Vollsperrung der Fahrbahn ist
      // 'sperrung'. "Vollsperrung des Geh- und Radwegs" (nur Geh/Rad), "Teilsperrung …" und
      // "keine Sperrung" (matchte fälschlich /sperrung/) bleiben 'baustelle' — KFZ kommt durch.
      const istVollKfz = /vollsperr/i.test(sperrung) && !/geh|rad|teil|keine/i.test(sperrung)
      const vollsperrung = istVollKfz || undefined
      const istSperrung = istVollKfz
      const [lng, lat] = ersterPunkt(f.geometry)
      // externeId muss eindeutig pro echtem Einzel-Eintrag UND run-stabil sein: zwei Meldungen am
      // selben Ort (je Fahrtrichtung / Bauphase / Maßnahme) teilen sich oft dieselbe baustelle_id und
      // würden beim Upsert auf (quellen_id, externe_id) kollabieren = stiller Datenverlust. Deshalb
      // einen deterministischen Diskriminator aus unterscheidenden Quellfeldern anhängen (kein Index).
      const quellId = p.baustelle_id ?? f.id ?? "x"
      const externeId = `${quellId}#${stabilHash(lat, lng, p.sperrung, p.massnahme, p.bezeichnung, p.adresse, p.von, p.bis)}`
      obstacles.push(makeNormalized({
        externeId,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: p.bezeichnung ?? p.adresse ?? "Baustelle Bonn",
        beschreibung: [p.massnahme, p.sperrung, p.adresse].filter(Boolean).join(" — ").trim() || null,
        lat, lng,
        strassenRef: refAusBezeichnung(p.bezeichnung),
        attrs: {
          vollsperrung,
          // T-454: Maßnahmenart strukturiert kennzeichnen (Gleisbau/Brückensanierung live belegt).
          // Kanalbau/Leitungsbau erkennt extractStammdaten.medium bereits über die Beschreibung.
          bahnbaustelle: /gleis|bahn|tram|schiene/i.test(massnahme) || undefined,
          brueckenbau: /br(?:ü|ue)cke/i.test(massnahme) || undefined,
        },
        realerStart: dateOnly(p.von),
        gueltigVon: dateOnly(p.von),
        gueltigBis: dateOnly(p.bis),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Bonn: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
