// Bestands-Anreicherung aus Freitext ("Datenaufbereinigung").
//
// Geht über JEDEN vorhandenen Datensatz und füllt fehlende strukturierte Felder aus name+beschreibung.
// Idempotent: ergänzt NUR leere Felder, überschreibt nie vorhandene Werte. Heute regelbasiert
// (extractStammdaten) — später ersetzt ein LLM-Pass (Mac Studio) genau diese Funktion bei gleicher
// Signatur: row → patch. Bewusst dünn + ein Andockpunkt, kein Logik-Duplikat.

import { extractStammdaten } from "./connectors/_helpers.js"

// extractStammdaten-Felder, die KEINE attrs sind (eigene Spalten) — alles andere wandert in attrs.
const NICHT_ATTR = new Set(["gueltigVon", "gueltigBis", "strassenRef", "richtung"])

/**
 * @param {{name?:string, beschreibung?:string, attrs?:object, gueltigVon?:string, gueltigBis?:string,
 *          strassenRef?:string, richtung?:string}} row
 * @returns {{changed:boolean, attrs:object, gueltigVon?:string, gueltigBis?:string,
 *            strassenRef?:string, richtung?:string, confidence?:number}} patch — attrs gemergt.
 *   confidence 0.6 markiert regelbasiert abgeleitete Felder (vs. autoritative Quelle/manuell) →
 *   der spätere LLM-Pass (Mac Studio) zielt nur auf leere + niedrig-confidente Felder.
 */
export function enrichFromText(row) {
  const text = [row.name, row.beschreibung].filter(Boolean).join(" · ")
  const ex = extractStammdaten(text)
  const attrs = row.attrs && typeof row.attrs === "object" ? { ...row.attrs } : {}
  let changed = false

  // Alle extrahierten attrs generisch übernehmen — nur Lücken füllen, Booleans nur true.
  for (const [k, v] of Object.entries(ex)) {
    if (NICHT_ATTR.has(k)) continue
    if (attrs[k] == null && v != null && v !== false && v !== "") { attrs[k] = v; changed = true }
  }

  const patch = { attrs }
  if (!row.gueltigVon && ex.gueltigVon) { patch.gueltigVon = ex.gueltigVon; changed = true }
  if (!row.gueltigBis && ex.gueltigBis) { patch.gueltigBis = ex.gueltigBis; changed = true }
  if (!row.strassenRef && ex.strassenRef) { patch.strassenRef = ex.strassenRef; changed = true }
  if (!row.richtung && ex.richtung) { patch.richtung = ex.richtung; changed = true }

  if (changed) patch.confidence = 0.6 // regelbasiert abgeleitet (kein autoritativer Quellwert)
  patch.changed = changed
  return patch
}
