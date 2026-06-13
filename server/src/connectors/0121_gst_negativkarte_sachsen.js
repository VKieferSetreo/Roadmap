// Connector Quelle 0121: GST-Negativkarten Sachsen (LASuV) — gesperrte Brücken (PDF je Landkreis).
// Port aus API/Länder/Sachsen/LASuV-GST-Negativkarte-PDF/gst-negativkarte-sachsen.cron.mjs.
// SONDERFALL: nur PDF je Landkreis × Tonnage (KEIN WFS/GeoJSON). Scrapt die PDF-Links von der
// LASuV-Seite. lat/lng=null (nicht georeferenziert) → Importer überspringt die Items sauber.
// vollbestand=false (Dokument-Referenzen, kein geokodierter Bestand; Reconcile darf nicht greifen).

import { makeNormalized, getText } from "./_helpers.js"

const QUELLE_NAME = "GST-Negativkarten Sachsen (LASuV) — gesperrte Brücken (PDF je Landkreis)"
const SEITE = "https://www.lasuv.sachsen.de/gst-negativkarten.html"
const HOST = "https://www.lasuv.sachsen.de"

// Dateiname → Landkreis + Tonnage + Stand. z.B. Negativkarte_Bautzen_48t_Stand_16_10_2025.pdf
function parse(url) {
  const fn = decodeURIComponent(url.split("/").pop() ?? "")
  const tM = fn.match(/_(\d{2,3})t/i)
  const sM = fn.match(/Stand_?(\d{1,2})_(\d{1,2})_(\d{4})/i)
  const lk = fn.replace(/^Negativkarte_/i, "").replace(/_\d{2,3}t.*$/i, "").replace(/_/g, " ").trim()
  return {
    landkreis: lk || null,
    tonnageT: tM ? Number(tM[1]) : null,
    stand: sM ? `${sM[3]}-${String(sM[2]).padStart(2, "0")}-${String(sM[1]).padStart(2, "0")}` : null,
  }
}

export const gstNegativkarteSachsenConnector = {
  quelleId: "0121",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: false,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const html = await getText(SEITE, { timeoutMs })
    const hrefs = html ? [...html.matchAll(/href="([^"]*Negativkarte[^"]*\.pdf)"/gi)].map((m) => m[1]) : []
    const links = [...new Set(hrefs)].map((h) => (h.startsWith("http") ? h : `${HOST}${h}`))
    log(`GST-Negativkarte-PDFs: ${links.length}`)
    const obstacles = []
    for (const url of links) {
      const { landkreis, tonnageT, stand } = parse(url)
      obstacles.push(makeNormalized({
        externeId: url.split("/").pop(),
        kategorie: "gewicht",
        name: `GST-Negativkarte ${landkreis ?? ""}${tonnageT ? ` (${tonnageT} t)` : ""}`.trim(),
        beschreibung: `Für Großraum-/Schwertransporte gesperrte/begrenzte Brücken im Landkreis ${landkreis ?? "?"} ` +
          `(Bezugsgewicht ${tonnageT ?? "?"} t). Quelle ist eine PDF-Karte — Geokodierung nachgelagert.`,
        lat: null, lng: null,
        strassenRef: null,
        attrs: {
          grundsaetzlicheGstSperre: true,
          bezugsgewichtT: tonnageT ?? undefined,
        },
        gueltigVon: stand, realerStart: stand,
        quelleName: QUELLE_NAME,
        quelleUrl: url,
      }))
    }
    return { obstacles }
  },
}
