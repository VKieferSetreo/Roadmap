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

// Stadt-Abkuerzungen in Knotennamen (Bescheid-Schreibweise) → voll, fuers Matching.
const CITY_ABK = { PB: "Paderborn", OL: "Oldenburg", DO: "Dortmund" }
const expandCity = (s) => String(s ?? "").replace(/\b(PB|OL|DO)\b/g, (m) => CITY_ABK[m])

// Levenshtein-Distanz → Aehnlichkeitsquote (0..1). Faengt adjektivische Knotennamen
// (Bremen↔Bremer Kreuz) und Bescheid-Tippfehler (Wünneberg↔Wünnenberg) ab; ersetzt den naiven
// Teilstring-Match, der "Wünneberg Haaren" auf "Haar" (München!) zog.
function lev(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}
const simRatio = (a, b) => (!a || !b ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length))
const FUZZY_MIN = 0.82

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
  // PB→Paderborn + geklebte Strassennr. hinten weg ("Stuhr A28"→"Stuhr"; fehlendes ' - ' im Bescheid).
  const q = expandCity(raw).replace(/\s+(A|B|L|K|St)\s?\d+[a-z]?$/i, "")
  // Typ aus abgekuerzt (AS/AK/AD) ODER ausgeschrieben (Anschlussstelle/Autobahnkreuz/-dreieck/Kreuz/Dreieck).
  const wantType = typeOf(q)
  const core = norm(q)
  if (!core) return null

  // Kandidaten = exakter Kern (r=1) UND fuzzy-aehnliche Keys (>=0.82). KEIN naiver Teilstring
  // (der zog z.B. "Wünneberg Haaren" auf "Haar"). Adjektivische Namen (Bremen→Bremer Kreuz) +
  // Tippfehler kommen so trotzdem rein.
  const scored = []
  for (const e of idx.get(core) || []) scored.push({ e, r: 1 })
  for (const [k, arr] of idx) {
    if (k === core) continue
    const r = simRatio(core, k)
    if (r >= FUZZY_MIN) for (const e of arr) scored.push({ e, r })
  }
  if (!scored.length) return null

  scored.sort((x, y) => {
    // 1) Typ-Treffer (AK→Kreuz, AD→Dreieck, AS→weder) — schlaegt sogar einen exakten Namens-Treffer
    //    des falschen Typs (z.B. AS "Bremen-Nord" vs. AK "Bremer Kreuz" bei "Autobahnkreuz Bremen").
    const xt = x.e.type === wantType ? 0 : 1
    const yt = y.e.type === wantType ? 0 : 1
    if (xt !== yt) return xt - yt
    if (y.r !== x.r) return y.r - x.r // 2) hoehere Aehnlichkeit
    // 3) naehste Laenge zum Kern
    return Math.abs(norm(x.e.name).length - core.length) - Math.abs(norm(y.e.name).length - core.length)
  })
  const best = scored[0]
  return { lat: best.e.lat, lng: best.e.lng, name: best.e.name, matched: best.r >= 1 ? "exakt" : "fuzzy" }
}
