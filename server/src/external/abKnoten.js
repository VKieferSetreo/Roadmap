// AB-Knoten-Gazetteer (T-567): löst VEMAGS-Autobahnknoten (AS/AK/AD <Name>) auf km-genaue
// Koordinaten auf — aus einem statischen Verzeichnis benannter OSM-`motorway_junction`-Knoten
// (Deutschland, einmal via Overpass gezogen → server/src/data/ab_knoten_de.json). OSM nur als
// Geometrie-Referenz; Max-Freigabe 2026-06-23. Kein Netz-Zugriff zur Laufzeit.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../data/ab_knoten_de.json")

/** name → normalisierter Kern (lowercase, ohne Kreuz/Dreieck/AS/AK/AD-Wörter, nur a-z0-9). */
function norm(s) {
  return String(s ?? "")
    .toLowerCase().replace(/ß/g, "ss")
    .replace(/\b(autobahn)?(kreuz|dreieck|anschlussstelle|as|ak|ad)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
}
const typeOf = (name) => (/kreuz/i.test(name) ? "AK" : /dreieck/i.test(name) ? "AD" : "AS")

// Index einmal bauen: core → [{name, lat, lng, type}].
let INDEX = null
function index() {
  if (INDEX) return INDEX
  INDEX = new Map()
  let rows = []
  try {
    rows = JSON.parse(readFileSync(DATA, "utf8"))
  } catch {
    rows = []
  }
  for (const [name, lat, lng] of rows) {
    const k = norm(name)
    if (!k) continue
    const entry = { name, lat, lng, type: typeOf(name) }
    const arr = INDEX.get(k)
    if (arr) arr.push(entry)
    else INDEX.set(k, [entry])
  }
  return INDEX
}

/**
 * Löst einen VEMAGS-Knotennamen ("AS Offenburg", "AK Bremen", "AD Stuhr") auf {lat,lng,name,matched}.
 * Typ-bewusst: AK bevorzugt Kreuz-Knoten, AD Dreieck-Knoten. null wenn nichts plausibles.
 */
export function resolveKnoten(raw) {
  const idx = index()
  const m = String(raw ?? "").match(/^(AS|AK|AD)\s+(.+)$/i)
  const wantType = m ? m[1].toUpperCase() : null
  const core = norm(m ? m[2] : raw)
  if (!core) return null

  // Kandidaten: exakter Kern, sonst Teilstring (Kern in Key oder Key in Kern).
  let cands = idx.get(core) || []
  let exact = cands.length > 0
  if (!cands.length) {
    for (const [k, arr] of idx) {
      if (k.includes(core) || core.includes(k)) cands.push(...arr)
    }
  }
  if (!cands.length) return null

  cands.sort((a, b) => {
    // 1) Typ-Treffer (AK→Kreuz, AD→Dreieck, AS→weder) bevorzugen.
    const at = wantType && a.type === wantType ? 0 : 1
    const bt = wantType && b.type === wantType ? 0 : 1
    if (at !== bt) return at - bt
    // 2) bei Teilstring-Match: geringste Längendifferenz zum Kern (näheste Übereinstimmung).
    return Math.abs(norm(a.name).length - core.length) - Math.abs(norm(b.name).length - core.length)
  })
  const best = cands[0]
  return { lat: best.lat, lng: best.lng, name: best.name, matched: exact ? "exakt" : "teil" }
}
