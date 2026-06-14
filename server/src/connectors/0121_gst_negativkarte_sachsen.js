// Connector Quelle 0121: GST-Negativkarten Sachsen (LASuV) — gesperrte Brücken (PDF je Landkreis).
// Port aus API/Länder/Sachsen/LASuV-GST-Negativkarte-PDF/gst-negativkarte-sachsen.cron.mjs.
// SONDERFALL: nur PDF je Landkreis × Tonnage (KEIN WFS/GeoJSON). Scrapt die PDF-Links von der
// LASuV-Seite. lat/lng=null (nicht georeferenziert) → Importer überspringt die Items sauber.
// vollbestand=false (Dokument-Referenzen, kein geokodierter Bestand; Reconcile darf nicht greifen).

import { makeNormalized, getText, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "GST-Negativkarten Sachsen (LASuV) — gesperrte Brücken (PDF je Landkreis)"
const SEITE = "https://www.lasuv.sachsen.de/gst-negativkarten.html"
const HOST = "https://www.lasuv.sachsen.de"
// Sachsen-Landesmitte (Dresden-Raum) als Koord-Fallback, wenn kein Landkreis-Zentroid matcht — so
// stirbt KEIN Item am validateObstacle-Gate des Importers (verlustfreier Import, Max-Vorgabe).
const SACHSEN_FALLBACK = [51.05, 13.74]

// Sächsische Kreise → Zentroid [lat,lng]. Die Negativkarte ist EIN PDF je Landkreis (kein Einzel-
// Bauwerk) → Karten-Lage ist bewusst nur Landkreis-grob. Schlüssel sind diakritik-gefaltete Tokens.
const SACHSEN_KREISE = {
  bautzen: [51.30, 14.30], goerlitz: [51.20, 14.85], meissen: [51.25, 13.55],
  mittelsachsen: [51.00, 13.05], nordsachsen: [51.45, 12.85],
  "saechsische schweiz": [50.85, 13.85], vogtland: [50.50, 12.20],
  zwickau: [50.75, 12.55], erzgebirg: [50.55, 13.05],
  "leipzig stadt": [51.34, 12.37], "stadt leipzig": [51.34, 12.37], leipzig: [51.15, 12.55],
  chemnitz: [50.83, 12.92], dresden: [51.05, 13.74],
}
/** Diakritik-Faltung (ä→ae …) für robustes Kreis-Matching aus Dateinamen. */
function falte(s) {
  return String(s ?? "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim()
}
/** Landkreis-Name → Zentroid (längster passender Schlüssel gewinnt; "leipzig stadt" vor "leipzig"). */
function kreisZentroid(landkreis) {
  const f = falte(landkreis)
  let best = null
  for (const [key, coord] of Object.entries(SACHSEN_KREISE)) {
    if (f.includes(key) && (!best || key.length > best.key.length)) best = { key, coord }
  }
  return best?.coord ?? null
}

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
      const dateiname = url.split("/").pop()
      const { landkreis, tonnageT, stand } = parse(url)
      const zentroid = kreisZentroid(landkreis)
      // Kein Landkreis-Treffer → Sachsen-Landesmitte als Fallback (NIE droppen), Warnung loggen,
      // damit fehlende SACHSEN_KREISE-Einträge sichtbar werden statt still verloren zu gehen.
      if (!zentroid) log(`GST-Negativkarte: kein Kreis-Zentroid für "${landkreis ?? "?"}" (${dateiname}) → Sachsen-Fallback-Koords`)
      const [lat, lng] = zentroid ?? SACHSEN_FALLBACK
      // externeId: STABIL über Läufe + EINDEUTIG pro Einzel-Eintrag. Der Dateiname (Quell-ID) ist
      // der native Identifier; ein stabilHash-Diskriminator über (lat,lng) + unterscheidende
      // Quellfelder (Landkreis, Tonnage-Stufe, Stand) verhindert Kollabieren bei mehreren PDFs je
      // Landkreis (gleiches Zentroid, andere Tonnage/Stand) und ist reconcile-stabil (kein Index/Random).
      const externeId = `${dateiname ?? "x"}#${stabilHash(lat, lng, landkreis, tonnageT, stand)}`
      obstacles.push(makeNormalized({
        externeId,
        kategorie: "gewicht",
        name: `GST-Negativkarte ${landkreis ?? ""}${tonnageT ? ` (${tonnageT} t)` : ""}`.trim(),
        beschreibung: `Für Großraum-/Schwertransporte gesperrte/begrenzte Brücken im Landkreis ${landkreis ?? "?"} ` +
          `(Bezugsgewicht ${tonnageT ?? "?"} t). Quelle ist eine PDF-Karte${zentroid ? " — Lage Landkreis-grob" : " — Lage Sachsen-grob (kein Kreis-Treffer)"}.`,
        lat, lng,
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
