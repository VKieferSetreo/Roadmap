// Connector Quelle 0227: Heidelberg — Baustellen (Open Data Heidelberg, Amt für Mobilität).
// JSON-Feed (ein Abruf), lat/lng nativ WGS84, Point. Lizenz CC-BY 4.0, „Stadt Heidelberg".
// CAVEAT: keine strukturierten Zeitraum-Felder — Datum nur als HTML-Freitext ("Zeitraum: …");
// best-effort geparst, sonst füllt makeNormalized() aus dem Beschreibungstext nach. Stadtgebiet,
// überwiegend Geh-/Radweg-Maßnahmen → für Schwertransport von geringem Wert (ehrlich markiert).

import { makeNormalized, getJson, stripHtml } from "./_helpers.js"

const QUELLE = "0227"
const QUELLE_NAME = "Heidelberg — Baustellen (Open Data Heidelberg)"
const QUELLE_URL = "https://www.heidelberg.de/"
const BASE = "https://www.heidelberg.de/site/Heidelberg2021/BSTXC/1254509/data.json"

// T-611: Heidelberg liefert Zeiträume NUR als deutschen Freitext ("Beginn der Arbeit: 6. Juli 2026",
// "Ende der Arbeiten: 17. August 2026") — nie als DD.MM.YYYY. alleDaten()/extractStammdaten in
// makeNormalized greifen darauf nicht → gueltig_von/bis blieben null → die Baustelle galt permanent
// als aktiv. Hier deutsche Monatsnamen-Daten lokal parsen: "Beginn …" → gueltigVon, "Ende …" → bis.
const MONAT_RE = [
  /jan/i, /feb/i, /m(?:ä|ae|a)r/i, /apr/i, /mai/i, /jun/i,
  /jul/i, /aug/i, /sep/i, /okt/i, /nov/i, /dez/i,
]

/** "3. November 2025" (deutscher Monatsname) → "2025-11-03", sonst null. Konservativ: Tag, Monat UND
 *  4-stelliges Jahr müssen alle erkennbar sein (kein Raten bei "Mitte 2028" / "September 2026" ohne Tag). */
function monatsDatum(text) {
  const m = String(text ?? "").match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(20\d{2})/)
  if (!m) return null
  const monIdx = MONAT_RE.findIndex((re) => re.test(m[2]))
  if (monIdx < 0) return null
  return `${m[3]}-${String(monIdx + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`
}

/** Gültigkeit aus dem Beschreibungs-Freitext: ein "Beginn …"-Datum → von, ein "Ende …"-Datum → bis.
 *  Das Label-Fenster endet am ersten Punkt/Doppelpunkt/Umbruch, damit kein fremdes Datum eingefangen
 *  wird (z.B. eine Bus-Umleitung "ab/bis …" zählt bewusst NICHT als Bauzeitraum). stripHtml dekodiert
 *  die Entities (z.B. "März" → "März"). */
function zeitraumAus(html) {
  const t = stripHtml(html) ?? ""
  const mb = t.match(/Beginn[^.\n:]{0,30}:?\s*(\d{1,2}\.\s*[A-Za-zäöüÄÖÜ]{3,9}\.?\s+20\d{2})/i)
  const me = t.match(/Ende[^.\n:]{0,40}:?\s*(\d{1,2}\.\s*[A-Za-zäöüÄÖÜ]{3,9}\.?\s+20\d{2})/i)
  return { von: mb ? monatsDatum(mb[1]) : null, bis: me ? monatsDatum(me[1]) : null }
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
      const zeit = zeitraumAus(p.beschreibung) // T-611: { von, bis } aus dt. Monatsnamen-Freitext
      return makeNormalized({
        externeId: p.pk_eintrag ?? p.id,
        kategorie: "baustelle",
        name: p.titel || "Baustelle",
        beschreibung: p.beschreibung || null, // makeNormalized strippt HTML + zieht Datum/Maße nach
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        strassenRef: null,
        attrs: {},
        gueltigVon: zeit.von,
        gueltigBis: zeit.bis,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${rows.length} Baustellen`)
    return { obstacles }
  },
}
