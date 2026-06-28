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

// T-611: Gattungswort-Varianten, die dasselbe Bauwerk meinen (Abkürzung/Umlaut),
// damit z.B. „LSW" und „Lärmschutzwand" als dieselbe Gattung erkannt werden.
const GATTUNGS_SYNONYME = [
  ["brücke", "bruecke"],
  ["stützwand", "stuetzwand"],
  ["lärmschutzwand", "laermschutzwand", "lsw"],
]

// T-611: Gattungswort-Verdopplung vermeiden — p.art nur voranstellen, wenn die
// Bezeichnung nicht ohnehin schon mit dem (ggf. synonymen) Gattungswort beginnt.
// Sonst entstünde „Brücke … Brücke" bzw. „LSW … Lärmschutzwand".
function bezeichnungMitArt(art, bezeichnung) {
  const a = String(art ?? "").trim()
  const b = String(bezeichnung ?? "").trim()
  if (!a) return b
  if (!b) return a
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  // Direkte Verdopplung: Bezeichnung beginnt bereits mit der art selbst.
  if (bl.startsWith(al)) return b
  // Synonyme: art gehört zu einer Gattung und Bezeichnung beginnt mit einer Variante.
  for (const gruppe of GATTUNGS_SYNONYME) {
    if (gruppe.some((g) => al.includes(g)) && gruppe.some((g) => bl.startsWith(g))) return b
  }
  return `${a} ${b}`
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
        // T-611: Gattungswort nicht doppeln (siehe bezeichnungMitArt).
        beschreibung: `Für Großraum-/Schwertransporte gesperrtes Bauwerk (§34 StVZO): ${bezeichnungMitArt(p.art, p.bezeichnung)}`.trim(),
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
