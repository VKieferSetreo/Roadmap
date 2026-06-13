#!/usr/bin/env node
// Cron-Job: Hessen Mobil — Lastbeschränkte Brücken (B/L/K) — Quellen-ID 0115.
// Goldstandard-Restriktion Hessen: für anhörpflichtigen Schwerlastverkehr gesperrte Brücken.
// Quelle ist eine Behörden-PDF (kein WFS/API). Die PDF wurde bereits in
// hessen-lastbeschraenkte-bruecken.json/.csv geparst (136 Brücken). Dieser Cron liest die
// strukturierte Datei ein (kein Neu-Abruf nötig), mappt in unser obstacle-Format v1.0
// (kategorie=bruecke, befristung=dauerhaft, attrs.grundsaetzlicheGstSperre=true, vnk/nnk) und
// schreibt hessen-mobil-lastbeschraenkte-bruecken.normalisiert.json. KEINE DB, NICHT die Engine.
// Re-Parsing der PDF (bei neuem Stand): pdftotext doku.pdf - | <Parser> → JSON neu erzeugen.
// Lauf:  node hessen-mobil-lastbeschraenkte-bruecken.cron.mjs
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import { makeObstacle, schreibeErgebnis } from "../../../_lib/format.mjs"

const QUELLE = "0126"
const QUELLE_NAME = "Hessen Mobil — Lastbeschränkte Brücken (GST-gesperrt)"
const QUELLE_URL = "https://mobil.hessen.de/verkehr/wirtschaftsverkehr/grossraum-und-schwertransporte/lastbeschraenkte-bruecken-im-zuge-von-bundes-landes-und-kreisstrassen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand: die aus der PDF geparste strukturierte Liste (136 Brücken, Stand im JSON).
const daten = JSON.parse(await readFile(join(HIER, "hessen-lastbeschraenkte-bruecken.json"), "utf-8"))
const bruecken = daten.bruecken ?? []
const stand = daten.stand ?? null
console.log(`Brücken verfügbar (PDF-Stand ${stand}): ${bruecken.length}`)

const obstacles = bruecken.map((b) => {
  // strasse_oben_uef = Straße, die ÜBER das Bauwerk führt (= die Straße mit der Lastrestriktion).
  const ref = normRef(b.strasse_oben_uef) ?? normRef(b.strasse_unten_uf)
  const teil = String(b.teilbauwerk ?? "0")
  const externeId = teil && teil !== "0" ? `${b.bauwerksnummer}-${teil}` : String(b.bauwerksnummer)
  return makeObstacle({
    quellenId: QUELLE, externeId,
    kategorie: "bruecke", befristung: "dauerhaft",
    name: b.bauwerksname || `Brücke ${b.bauwerksnummer}`,
    beschreibung: [b.ort, b.strasse_oben_uef && `UeF ${b.strasse_oben_uef}`, b.strasse_unten_uf && `UF ${b.strasse_unten_uf}`]
      .filter(Boolean).join(", ") || null,
    lat: null, lng: null, // PDF-Liste ohne Geokoordinaten — ASB-Netzbezug (VNK/NNK) ist der Anker
    strassenRef: ref,
    vnk: b.von_nk || null, nnk: b.nach_nk || null,
    attrs: { grundsaetzlicheGstSperre: true },
    quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
    roh: { ...b, stand }, abgerufenAm: now,
  })
})

function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b(A|B|L|K)\s?\d{1,4}\b/)
  return m ? m[0].replace(/\s/, "") : null
}

const erg = await schreibeErgebnis(HIER, "hessen-mobil-lastbeschraenkte-bruecken", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: bruecken.length, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`verfügbar: ${bruecken.length} · normalisiert: ${obstacles.length}`)
console.log(`mit Straßen-Ref:`, obstacles.filter((o) => o.strassen_ref != null).length,
  `· mit VNK/NNK:`, obstacles.filter((o) => o.vnk && o.nnk).length,
  `· alle GST-gesperrt:`, obstacles.every((o) => o.attrs.grundsaetzlicheGstSperre))
console.log(`(Hinweis: PDF-Liste ohne Geokoordinaten → lat/lng=null, Anker ist ASB-Netzbezug VNK/NNK)`)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
