// Connector Quelle 0227: Heidelberg — Baustellen (Open Data Heidelberg, Amt für Mobilität).
// JSON-Feed (ein Abruf), lat/lng nativ WGS84, Point. Lizenz CC-BY 4.0, „Stadt Heidelberg".
// CAVEAT: keine strukturierten Zeitraum-Felder — Datum nur als HTML-Freitext ("Zeitraum: …");
// best-effort geparst, sonst füllt makeNormalized() aus dem Beschreibungstext nach. Stadtgebiet,
// überwiegend Geh-/Radweg-Maßnahmen → für Schwertransport von geringem Wert (ehrlich markiert).

import { makeNormalized, getJson, dateOnly } from "./_helpers.js"

const QUELLE = "0227"
const QUELLE_NAME = "Heidelberg — Baustellen (Open Data Heidelberg)"
const QUELLE_URL = "https://www.heidelberg.de/"
const BASE = "https://www.heidelberg.de/site/Heidelberg2021/BSTXC/1254509/data.json"

function zeitraumAus(html) {
  const t = String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ")
  const m = t.match(/Zeitraum:\s*([^.\n]{4,40})/i)
  return m ? dateOnly(m[1]) : null
}

export const heidelbergBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const data = await getJson(BASE, { timeoutMs })
    const rows = Array.isArray(data?.data) ? data.data : []
    const obstacles = rows.map((p) => {
      const lat = Number(p.adresse_latitude), lng = Number(p.adresse_longitude)
      return makeNormalized({
        externeId: p.pk_eintrag ?? p.id,
        kategorie: "baustelle",
        name: p.titel || "Baustelle",
        beschreibung: p.beschreibung || null, // makeNormalized strippt HTML + zieht Datum/Maße nach
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        strassenRef: null,
        attrs: {},
        gueltigVon: zeitraumAus(p.beschreibung),
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${rows.length} Baustellen`)
    return { obstacles }
  },
}
