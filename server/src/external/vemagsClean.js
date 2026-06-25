// VEMAGS-Wegpunkt-Bereinigung (portiert aus dem verifizierten Python-Prototyp, Max 2026-06-25).
// VEMAGS-Bescheide haben variierende Geocode-Qualitaet: generische Lokalstrassen ("Nordstrasse")
// landen ohne PLZ in der falschen Stadt, Strassen-Segmente snappen auf irgendeinen Punkt → die
// Route macht sinnlose Schlenker/Hin-und-Zurueck. Regel (Max): solche Punkte WEGLASSEN und zum
// naechsten sicheren Punkt ziehen. Echte Knoten/90°-Knicke bleiben.
//
// Konfidenz-gestaffelt:
//   HOCH  (junction/start/ziel = Gazetteer/PLZ-Adresse): konservativ (nur klare Fern-Geocodes raus)
//   LOKAL (place/strasse): aggressiv (unzuverlaessig, OSRM routet eh sauber dazwischen)

const R = 6371
const rad = Math.PI / 180

export function haversineKm(a, b) {
  const dla = (b.lat - a.lat) * rad
  const dlo = (b.lng - a.lng) * rad
  const la1 = a.lat * rad
  const la2 = b.lat * rad
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const isHighConf = (typ) => typ === "junction" || typ === "start" || typ === "ziel"

// Hin-und-Zurueck-Ausreisser entfernen: Umweg A→B→C deutlich laenger als direkt A→C.
// Per Verhaeltnis (nicht absolut), damit echte 90°-Knicke (z.B. A2/A14 am Kreuz: ratio ~1.3) bleiben,
// falsche Fern-Geocodes (ratio ~2.4) aber rausfliegen. Konfidenz-gestaffelte Schwellen.
function dropDetours(pts) {
  const kept = pts.slice()
  const dropped = []
  while (kept.length > 2) {
    let worst = null
    for (let k = 1; k < kept.length - 1; k++) {
      const a = kept[k - 1].c
      const b = kept[k].c
      const c = kept[k + 1].c
      const legs = haversineKm(a, b) + haversineKm(b, c)
      const direct = haversineKm(a, c)
      const excess = legs - direct
      const ratio = direct > 0.1 ? legs / direct : 99
      const [rmin, emin] = isHighConf(kept[k].typ) ? [1.7, 20] : [1.6, 10]
      if (ratio > rmin && excess > emin && (!worst || ratio > worst.ratio)) {
        worst = { k, ratio, excess }
      }
    }
    if (!worst) break
    dropped.push({ ...kept[worst.k], umwegKm: Math.round(worst.excess) })
    kept.splice(worst.k, 1)
  }
  return { kept, dropped }
}

/**
 * Bereinigt die aufgeloeste Wegpunktfolge eines Fahrtwegteils.
 * @param {{raw:string, typ:string, c:{lat:number,lng:number}}[]} pts  aufgeloeste Punkte (c != null)
 * @returns {{kept:typeof pts, dropped:object[]}}
 */
export function cleanWaypoints(pts) {
  const resolved = pts.filter((p) => p && p.c)
  // 1) Near-Duplikate (<0.4 km) kollabieren
  let seq = []
  for (const p of resolved) {
    if (!seq.length || haversineKm(p.c, seq[seq.length - 1].c) > 0.4) seq.push(p)
  }
  // 2) Last-Mile-Rauschen: LOKALE Punkte <1.5 km von Start/Ziel weg (die praezise Adresse deckt das ab;
  //    verhindert Hafen-/Depot-Loops aus Strassen-Geocode-Streuung)
  const ends = seq.filter((p) => p.typ === "start" || p.typ === "ziel").map((p) => p.c)
  const dropped = []
  if (ends.length) {
    seq = seq.filter((p) => {
      const near = !isHighConf(p.typ) && ends.some((e) => haversineKm(p.c, e) < 1.5)
      if (near) dropped.push({ ...p, umwegKm: 0 })
      return !near
    })
  }
  // 3) Hin-und-Zurueck-Ausreisser
  const det = dropDetours(seq)
  return { kept: det.kept, dropped: dropped.concat(det.dropped) }
}
