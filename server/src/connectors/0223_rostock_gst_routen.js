// Connector Quelle 0223: Rostock — GST gesperrte Ingenieurbauwerke (OpenData.HRO).
// Port aus rostock-gst-routen.cron.mjs. Statisches GeoJSON (geo.sv.rostock.de, WGS84, Point):
// für Großraum-/Schwertransporte (§34 StVZO) GESPERRTE städtische Ingenieurbauwerke. Das sind
// DAUERHAFTE Bauwerksrestriktionen (grundsaetzlicheGstSperre=true). Ein Voll-Abruf.

import { makeNormalized, getJson, ersterPunkt } from "./_helpers.js"

const PORTAL = "https://www.opendata-hro.de/dataset/grossraum_schwertransportrouten"
const QUELLE_NAME = "Rostock — GST gesperrte Ingenieurbauwerke (OpenData.HRO)"
const URL = "https://geo.sv.rostock.de/download/opendata/grossraum_schwertransportrouten/grossraum_schwertransportrouten_ingenieurbauwerke.json"

// art → Kategorie: Brücke = bruecke; sonstiges GST-gesperrtes Bauwerk = dauerhafte Sperrung.
function kategorieAusArt(art) {
  const a = String(art ?? "").toLowerCase()
  if (a.includes("brücke") || a.includes("bruecke")) return "bruecke"
  if (a.includes("tunnel")) return "tunnel"
  return "sperrung"
}

export const rostockGstRoutenConnector = {
  quelleId: "0223",
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
      const [lng, lat] = ersterPunkt(f.geometry)
      obstacles.push(makeNormalized({
        externeId: p.uuid ?? p.bauwerksnummer ?? f.id,
        kategorie: kategorieAusArt(p.art),
        name: [p.bauwerksnummer, p.bezeichnung].filter(Boolean).join(" — ") || "GST-gesperrtes Bauwerk Rostock",
        beschreibung: `Für Großraum-/Schwertransporte gesperrtes Bauwerk (§34 StVZO): ${p.art ?? ""} ${p.bezeichnung ?? ""}`.trim(),
        lat, lng,
        strassenRef: null,
        attrs: {
          grundsaetzlicheGstSperre: true,
        },
        realerStart: null, // dauerhaftes Bauwerk: kein "Start"-Datum
        gueltigBis: null,   // unbefristet
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Rostock GST: ${feats.length} Features → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
