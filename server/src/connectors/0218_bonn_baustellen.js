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

// T-611: Erste erkennbare Straße aus einem Adress-Freitext (deutsche Straßen-Endungen), z. B.
// "Adenauerallee 50, 53113 Bonn" → "Adenauerallee". Dient nur dem Abgleich, ob die 'bezeichnung'
// dieselbe Straße meint wie die 'adresse'. Findet sich keine eindeutige Straße → null (konservativ).
function strasseAusAdresse(s) {
  const m = String(s ?? "").match(/\b([A-Za-zÄÖÜäöüß.-]+(?:stra(?:ß|ss)e|str\.?|weg|ring|allee|platz|gasse|ufer|damm|wall|chaussee|br(?:ü|ue)cke))\b/i)
  return m ? m[1] : null
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
      // T-611: 'bezeichnung' ist teils ein Bereichs-/Projektname, der eine ANDERE Straße nennt als die
      // tatsächliche Arbeitsadresse. Die echte Lage trägt die Geometrie bzw. das Feld 'adresse'. Nennt
      // 'adresse' eine konkrete Straße, die in 'bezeichnung' NICHT vorkommt, ist 'bezeichnung' ein
      // Projektname → Titel um die echte Adresse bauen, 'bezeichnung' bleibt als Kontext in Klammern
      // (es verschwindet nichts). Im Zweifel — keine eindeutige Straße in 'adresse' oder die Straße
      // steckt schon in 'bezeichnung' — bleibt 'bezeichnung' der Titel (konservativ, alte Logik).
      const bez = String(p.bezeichnung ?? "").trim()
      const adrStrasse = strasseAusAdresse(p.adresse)
      const bezIstProjektname = !!bez && !!adrStrasse && !bez.toLowerCase().includes(adrStrasse.toLowerCase())
      const titel = bezIstProjektname
        ? `${p.adresse} (${p.bezeichnung})`
        : (p.bezeichnung ?? p.adresse ?? "Baustelle Bonn")
      obstacles.push(makeNormalized({
        externeId,
        kategorie: istSperrung ? "sperrung" : "baustelle",
        name: titel,
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
