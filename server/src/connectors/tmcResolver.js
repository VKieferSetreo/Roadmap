// TMC/ALERT-C-Location-Resolver gegen die BASt-LCL (Deutschland, Tabelle 1).
// Quellen wie Niedersachsen liefern in DATEX-II nur ALERT-C-Location-Codes (kein lat/lng).
// Die kompakte data/tmc_de.json (aus LCL22, Generator-Output) bildet Location-Code → Koordinaten
// ab; über die POFFSET-Verkettung (NEG/POS) lässt sich zwischen Primary/Secondary eine Linie ziehen.
//
// tmc_de.json: { "<lcd>": [lat, lng, negOffLcd, posOffLcd], … }

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

let MAP = null
function load() {
  if (MAP) return MAP
  try {
    MAP = JSON.parse(readFileSync(fileURLToPath(new URL("../data/tmc_de.json", import.meta.url)), "utf8"))
  } catch {
    MAP = {}
  }
  return MAP
}

const MAX_HOPS = 600 // Schutz vor Endlos-Verkettung; reale Extents sind kurz

/** Folgt der POFFSET-Kette von fromLcd (Feld 2=neg, 3=pos) bis toLcd. → [[lng,lat],…] | null */
function walk(map, fromLcd, toLcd, field) {
  const coords = []
  let cur = String(fromLcd)
  const target = String(toLcd)
  for (let i = 0; i <= MAX_HOPS; i += 1) {
    const e = map[cur]
    if (!e) return null
    coords.push([e[1], e[0]]) // GeoJSON [lng,lat]
    if (cur === target) return coords
    const next = e[field]
    if (!next) return null
    cur = String(next)
  }
  return null
}

/** ALERT-C-Linear (Primary/Secondary-LCD) → { lat, lng, geom } (Linie via POFFSET-Kette,
 *  sonst Primary→Secondary als 2-Punkt-Linie, sonst nur Primary-Punkt). null wenn unauflösbar. */
export function resolveTmc({ primary, secondary } = {}) {
  const map = load()
  const pri = map[String(primary)]
  if (!pri) return null
  const result = { lat: pri[0], lng: pri[1], geom: null }
  if (secondary != null && map[String(secondary)]) {
    const pos = walk(map, primary, secondary, 3)
    const neg = walk(map, primary, secondary, 2)
    const chain = pos && neg ? (pos.length <= neg.length ? pos : neg) : pos || neg
    if (chain && chain.length >= 2) {
      result.geom = { type: "LineString", coordinates: chain }
    } else {
      const sec = map[String(secondary)]
      result.geom = { type: "LineString", coordinates: [[pri[1], pri[0]], [sec[1], sec[0]]] }
    }
  }
  return result
}
