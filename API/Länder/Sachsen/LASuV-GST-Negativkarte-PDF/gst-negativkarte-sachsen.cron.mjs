#!/usr/bin/env node
// Cron-Job: GST-Negativkarten Sachsen (LASuV) — Quellen-ID 0121.
// SONDERFALL: Die für GST gesperrten Brücken Sachsens liegen NUR als PDF je Landkreis × Tonnage
// vor (KEIN WFS/GeoJSON). Dieser Cron sammelt automatisch die aktuellen PDF-Links von der
// LASuV-Seite und mappt sie in unser obstacle-Format v1.0 als befristung=dauerhaft-Dokument-
// Referenzen (lat/lng=null, da nicht georeferenziert; PDF-URL + Tonnage in attrs/quelle).
// Schreibt zur VERIFIKATION gst-negativkarte-sachsen.normalisiert.json. NICHT in die DB.
//
// Inhaltlich die wertvollste GST-Brücken-Quelle der Ost-Länder, aber Format (PDF) erfordert
// nachgelagert PDF→Georeferenz. Maschinenlesbare Variante bei LASuV erfragen (presse@lasuv.sachsen.de).
//
// Lauf:  node gst-negativkarte-sachsen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getText, schreibeErgebnis, dateOnly } from "../../../_lib/format.mjs"

const QUELLE = "0121"
const QUELLE_NAME = "GST-Negativkarten Sachsen (LASuV) — gesperrte Brücken (PDF je Landkreis)"
const HIER = dirname(fileURLToPath(import.meta.url))
const SEITE = "https://www.lasuv.sachsen.de/gst-negativkarten.html"
const HOST = "https://www.lasuv.sachsen.de"
const now = new Date().toISOString()

// GESAMTER Bestand: alle Negativkarte-PDF-Links von der Seite ziehen (8 Landkreise × Tonnagen).
const html = await getText(SEITE, { timeoutMs: 30000 })
const hrefs = [...html.matchAll(/href="([^"]*Negativkarte[^"]*\.pdf)"/gi)].map((m) => m[1])
const links = [...new Set(hrefs)].map((h) => (h.startsWith("http") ? h : `${HOST}${h}`))
console.log(`GST-Negativkarte-PDFs gefunden: ${links.length}`)

function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

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

const obstacles = links.map((url) => {
  const { landkreis, tonnageT, stand } = parse(url)
  return makeObstacle({
    quellenId: QUELLE, externeId: url.split("/").pop(),
    kategorie: "gewicht", befristung: "dauerhaft",
    name: `GST-Negativkarte ${landkreis ?? ""}${tonnageT ? ` (${tonnageT} t)` : ""}`.trim(),
    beschreibung: `Für Großraum-/Schwertransporte gesperrte/begrenzte Brücken im Landkreis ${landkreis ?? "?"} ` +
      `(Bezugsgewicht ${tonnageT ?? "?"} t). Quelle ist eine PDF-Karte — Geokodierung der einzelnen Brücken nachgelagert.`,
    lat: null, lng: null,
    strassenRef: null,
    attrs: cleanAttrs({
      grundsaetzlicheGstSperre: true,
      bezugsgewichtT: tonnageT ?? undefined,
      landkreis: landkreis ?? undefined,
      pdfUrl: url,
      formatHinweis: "PDF — nicht georeferenziert, Brücken-Extraktion nachgelagert",
    }),
    gueltigVon: stand ? dateOnly(stand) : null, realerStart: stand ? dateOnly(stand) : null,
    quelleName: QUELLE_NAME, quelleUrl: url, roh: { url, landkreis, tonnageT, stand }, abgerufenAm: now,
  })
})

const erg = await schreibeErgebnis(HIER, "gst-negativkarte-sachsen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: links.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${links.length} · normalisiert: ${obstacles.length}`)
console.log(`Landkreise:`, [...new Set(obstacles.map((o) => o.attrs.landkreis))].filter(Boolean))
console.log(`Bezugsgewichte (t):`, [...new Set(obstacles.map((o) => o.attrs.bezugsgewichtT))].filter(Boolean).sort((a, b) => a - b))
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
