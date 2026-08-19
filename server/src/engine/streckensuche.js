// Streckensuche: nicht EINE Route planen, sondern einen Korridor DURCHSUCHEN.
//
// Warum überhaupt: Die bisherige Umfahrung setzt einen Via-Punkt seitlich ins Feld und
// rechnet die GESAMTE Route neu (umfahreZonen). Das ist ein grobes Werkzeug — gemessen
// am 19.08.2026 hielt weniger als die Hälfte der gesetzten Sperrzonen. Ein Disponent
// arbeitet anders: er denkt in Knoten („über AK Walsrode oder über AS Soltau?"), fährt
// von beiden Enden auf die Mitte zu und flickt einzelne Abschnitte lokal.
//
// Genau das steht hier:
//   1. BLOCKER-KARTE: alle harten Hindernisse des Korridors EINMAL laden. Danach ist die
//      Bewertung einer Kante reine Geometrie — kein weiterer Datenbank- oder Netzaufruf.
//      Das ist der Grund, warum die Suche überhaupt tief laufen kann.
//   2. KNOTEN: benannte Autobahnknoten (AS/AK/AD) im Korridor als Zwischenziele.
//   3. BIDIREKTIONAL: Fronten von Start UND Ziel, die sich in der Mitte treffen.
//   4. LOKAL SPERREN: hat eine Kante einen Blocker, wird NUR DIESE KANTE neu gesucht —
//      über OSRM-Alternativen und über einen Ausweichknoten. Der Rest bleibt stehen.
//
// Bewusst NICHT gierig: eine Kante, die einen Blocker gegen zwei neue tauscht, ist
// erlaubt, wenn die neuen umfahrbar sind. Deshalb ist ein Blocker ein Strafterm in
// Kilometern und kein Ausschluss (STRAFE_KM) — die Suche darf tauschen, sie muss nur
// am Ende bezahlen.

import { buildRouteGrid, cumulativeKm, haversineKm, nearestOnRoute } from "./geometry.js"

/**
 * Wie viele Kilometer Umweg ein ungelöster Blocker "wert" ist.
 *
 * Bewusst hoch: Eine Strecke mit offener Vollsperrung ist nicht „40 km schlechter",
 * sie ist unbrauchbar — der Transport kann sie nicht fahren. 250 km heißt praktisch:
 * fast jeder Umweg schlägt einen verbleibenden Blocker.
 *
 * Das ist KEIN Widerspruch zum Tauschen (Max, 19.08.: „darf gerne gegen mehrere neue
 * tauschen, wenn die umfahrbar sind"): Die Strafe zählt nur für Blocker, die am Ende
 * noch auf der Strecke liegen. Ein Zwischenschritt, der einen Blocker gegen drei neue
 * tauscht, wird dadurch nicht verboten — die drei werden ihrerseits gesucht, und erst
 * was ungelöst übrig bleibt, kostet.
 */
export const STRAFE_KM = 250
/** Ab diesem Abstand zur Fahrlinie gilt ein Hindernis als NICHT auf der Strecke. */
export const TREFFER_M = 150

/**
 * Liegt der Blocker auf dieser Kante? Segmentweise gemessen, nicht stützpunktweise —
 * zwischen zwei Stützpunkten liegen bei grober Geometrie mehrere Kilometer.
 */
export function blockerAufKante(geometrie, blocker, { pufferM = TREFFER_M } = {}) {
  const linie = Array.isArray(geometrie) ? geometrie : []
  if (linie.length < 2) return []
  // Gitter einmal je Kante bauen: bei mehreren hundert Blockern gegen eine lange
  // Geometrie ist die naive Schleife der teuerste Teil der ganzen Suche.
  const cum = cumulativeKm(linie)
  const grid = buildRouteGrid(linie)
  const treffer = []
  for (const b of blocker ?? []) {
    if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) continue
    const nah = nearestOnRoute(b, linie, cum, grid)
    if (nah.distM <= pufferM) treffer.push({ ...b, abstandM: Math.round(nah.distM), km: Math.round(nah.km * 10) / 10 })
  }
  return treffer
}

/** Kosten einer Kante: Kilometer plus Strafe je ungelöstem Blocker. */
export function kosten(distanzKm, blockerAnzahl, { strafeKm = STRAFE_KM } = {}) {
  return distanzKm + blockerAnzahl * strafeKm
}

/**
 * Knoten im Korridor zwischen Start und Ziel: alle, die nicht weiter als `korridorKm`
 * von der Luftlinie entfernt liegen — und die den Weg nicht verlängern, indem sie
 * hinter Start oder Ziel liegen (Projektion auf die Achse).
 *
 * Sortiert nach Fortschritt entlang der Achse, damit die Expansion vorne anfängt.
 */
export function knotenImKorridor(start, ziel, knoten, { korridorKm = 60, max = 120 } = {}) {
  const gesamt = haversineKm(start, ziel)
  if (!gesamt) return []
  const treffer = []
  for (const k of knoten ?? []) {
    const dStart = haversineKm(start, k)
    const dZiel = haversineKm(ziel, k)
    // Ellipsen-Kriterium: Umweg über diesen Knoten höchstens korridorKm länger als direkt.
    const umweg = dStart + dZiel - gesamt
    if (umweg > korridorKm) continue
    treffer.push({ ...k, fortschritt: dStart / (dStart + dZiel), umwegKm: Math.round(umweg * 10) / 10 })
  }
  treffer.sort((a, b) => a.umwegKm - b.umwegKm)
  return treffer.slice(0, max)
}

/**
 * Eine Kante suchen: von A nach B, unter Berücksichtigung der Blocker.
 *
 * Zuerst die OSRM-Alternativen (mehrere echte Korridore aus EINEM Aufruf) — die beste
 * blockerfreie gewinnt. Bleibt keine frei, gewinnt die mit der geringsten Strafe; die
 * Blocker werden mitgegeben, damit die übergeordnete Suche entscheiden kann, ob sie
 * über einen anderen Knoten geht.
 */
export async function sucheKante(von, nach, { blocker, route, alternativen = 3, protokoll = [] } = {}) {
  const varianten = await route(von, nach, { anzahl: alternativen })
  if (!varianten?.length) {
    protokoll.push({ art: "kante", von: von.name ?? null, nach: nach.name ?? null, ergebnis: "keine Route" })
    return null
  }
  const bewertet = varianten.map((v) => {
    const treffer = blockerAufKante(v.geometry, blocker)
    return { ...v, blocker: treffer, kosten: kosten(v.distanzKm, treffer.length) }
  })
  bewertet.sort((a, b) => a.kosten - b.kosten)
  const beste = bewertet[0]
  protokoll.push({
    art: "kante",
    von: von.name ?? "Start",
    nach: nach.name ?? "Ziel",
    varianten: bewertet.length,
    gewaehltKm: Math.round(beste.distanzKm),
    blocker: beste.blocker.length,
    ergebnis: beste.blocker.length ? "mit Blocker" : "frei",
  })
  return beste
}

/**
 * Bidirektionale Korridorsuche.
 *
 * Von Start UND Ziel wächst je eine Front über Autobahnknoten aufeinander zu. Jeder
 * erreichte Knoten merkt sich, was er gekostet hat und wie viele Blocker auf dem Weg
 * dorthin liegen. Trifft ein Knoten in beiden Fronten zusammen, ist eine durchgehende
 * Strecke gefunden — Start ⇢ Knoten ⇢ Ziel.
 *
 * Warum von beiden Seiten: Ein Blocker sitzt selten in der Mitte. Wer nur von vorne
 * sucht, arbeitet sich durch den halben Korridor, bevor er merkt, dass das Problem am
 * ZIEL liegt. Zwei Fronten halbieren die Tiefe und finden die Engstelle von der Seite,
 * auf der sie liegt.
 *
 * Das Budget ist die Bremse: `maxKanten` begrenzt die OSRM-Aufrufe, `maxMs` die Zeit.
 * Beides wird protokolliert — eine Suche, die ins Budget läuft, sagt das, statt so zu
 * tun, als sei der Korridor erschöpft.
 */
export async function sucheStrecke(
  start,
  ziel,
  {
    blocker = [],
    knoten = [],
    route,
    korridorKm = 60,
    maxKanten = 40,
    maxMs = 90_000,
    breite = 4,
    jetzt = () => Date.now(),
  } = {},
) {
  const protokoll = []
  const t0 = jetzt()
  let kanten = 0
  const budgetOffen = () => kanten < maxKanten && jetzt() - t0 < maxMs

  const merke = async (von, nach) => {
    if (!budgetOffen()) return null
    kanten++
    return sucheKante(von, nach, { blocker, route, protokoll })
  }

  // 1. Direkt. Ist der Weg frei, ist die Suche hier zu Ende — kein Grund, einen
  //    Korridor zu durchkämmen, für den es keine Frage gibt.
  const direkt = await merke({ ...start, name: "Start" }, { ...ziel, name: "Ziel" })
  if (!direkt) {
    return { gefunden: false, grund: "Für Start und Ziel kam keine Route zurück", protokoll, kanten }
  }
  const beste = {
    geometrie: direkt.geometry,
    distanzKm: direkt.distanzKm,
    blocker: direkt.blocker,
    kosten: direkt.kosten,
    ueber: [],
  }
  if (!direkt.blocker.length) {
    protokoll.push({ art: "ergebnis", ergebnis: "direkte Strecke ist frei" })
    return { gefunden: true, beste, protokoll, kanten, budgetErschoepft: false }
  }

  // 2. Kandidatenknoten im Korridor. Nahe an den Blockern zuerst: dort entscheidet
  //    sich, ob es eine Ausweichachse gibt.
  const kandidaten = knotenImKorridor(start, ziel, knoten, { korridorKm })
  const naheAmBlocker = (k) => Math.min(...direkt.blocker.map((b) => haversineKm(k, b)))
  const sortiert = [...kandidaten].sort((a, b) => naheAmBlocker(a) - naheAmBlocker(b))
  protokoll.push({
    art: "korridor",
    knotenGefunden: kandidaten.length,
    blockerDirekt: direkt.blocker.length,
    ersteKandidaten: sortiert.slice(0, breite).map((k) => k.name),
  })

  // 3. Zwei Fronten. Von Start aus vorwärts, vom Ziel aus rückwärts — je Knoten die
  //    beste bekannte Kante. Ein Knoten, den BEIDE Fronten erreichen, verbindet.
  const vonStart = new Map()
  const zumZiel = new Map()
  for (const k of sortiert.slice(0, breite)) {
    const hin = await merke({ ...start, name: "Start" }, k)
    if (hin) vonStart.set(k.name, { knoten: k, kante: hin })
    const her = await merke(k, { ...ziel, name: "Ziel" })
    if (her) zumZiel.set(k.name, { knoten: k, kante: her })
  }

  for (const [name, a] of vonStart) {
    const b = zumZiel.get(name)
    if (!b) continue
    const gesamtBlocker = [...a.kante.blocker, ...b.kante.blocker]
    const gesamtKm = a.kante.distanzKm + b.kante.distanzKm
    const k = kosten(gesamtKm, gesamtBlocker.length)
    protokoll.push({
      art: "verbindung",
      ueber: name,
      km: Math.round(gesamtKm),
      blocker: gesamtBlocker.length,
      besserAlsBisher: k < beste.kosten,
    })
    if (k < beste.kosten) {
      beste.geometrie = [...a.kante.geometry, ...b.kante.geometry]
      beste.distanzKm = gesamtKm
      beste.blocker = gesamtBlocker
      beste.kosten = k
      beste.ueber = [name]
    }
  }

  const budgetErschoepft = !budgetOffen()
  protokoll.push({
    art: "ergebnis",
    ergebnis: beste.blocker.length ? `beste Strecke hat noch ${beste.blocker.length} Blocker` : "blockerfreie Strecke gefunden",
    ueber: beste.ueber,
    kanten,
    budgetErschoepft,
  })
  return { gefunden: true, beste, protokoll, kanten, budgetErschoepft }
}
