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
import { evaluate, AUSWERTUNG_AUSGESCHLOSSEN } from "./rules.js"
import { OBSTACLE_COLS } from "../obstaclesRepo.js"
import { rowToObstacle } from "../map.js"

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

/** Schlüssel für den Kanten-Cache: auf ~10 m gerundete Koordinaten. */
const kantenSchluessel = (a, b) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`

/**
 * Routen-Cache ÜBER Suchen hinweg.
 *
 * Der Cache innerhalb einer Suche hilft nur dort. In der Praxis laufen aber mehrere
 * Suchen kurz hintereinander auf demselben Korridor — der Agent sucht, fragt nach,
 * sucht erneut. Die Geometrie zwischen zwei Autobahnknoten ändert sich dabei nicht;
 * bewertet werden die Blocker ohnehin jedes Mal neu, denn die hängen an Transport und
 * Zeitraum. Zwischengespeichert wird deshalb NUR die Routen-Antwort.
 *
 * Klein und kurzlebig gehalten: 500 Kanten, 30 Minuten. Es geht um denselben Vorgang,
 * nicht um ein Straßennetz im Speicher.
 */
const ROUTEN_CACHE = new Map()
const ROUTEN_TTL_MS = 30 * 60_000
const ROUTEN_MAX = 500

export function mitRoutenCache(route, { jetzt = () => Date.now() } = {}) {
  return async (a, b, opt = {}) => {
    const key = `${kantenSchluessel(a, b)}|${opt.anzahl ?? 3}`
    const treffer = ROUTEN_CACHE.get(key)
    if (treffer && jetzt() - treffer.zeit < ROUTEN_TTL_MS) return treffer.wert
    const wert = await route(a, b, opt)
    // Nichts Leeres merken: ein Ausfall des Routers wäre sonst eine halbe Stunde lang
    // die Wahrheit.
    if (wert?.length) {
      if (ROUTEN_CACHE.size >= ROUTEN_MAX) ROUTEN_CACHE.delete(ROUTEN_CACHE.keys().next().value)
      ROUTEN_CACHE.set(key, { zeit: jetzt(), wert })
    }
    return wert
  }
}

/**
 * Kette über BELIEBIG VIELE Knoten — A* über den Korridor.
 *
 * Zwei Zwischenknoten reichen für eine Parallelachse. Sie reichen NICHT, wenn der
 * Umweg selbst wieder Stellen hat: rauf auf die Parallele, dort eine Baustelle, also
 * noch einmal seitlich raus und erst danach zurück. Auf den schweren Fällen (Emden →
 * Ulm, 45 m / 4,8 m / 140 t) ist genau das der Normalfall.
 *
 * Als Graph gedacht: Knoten sind Start, Ziel und die Korridorknoten, eine Kante ist
 * ein Routing-Aufruf. A* mit der Luftlinie zum Ziel als Schätzung — die ist nie
 * länger als die Fahrstrecke, die gefundene Kette also die günstigste im aufgespannten
 * Netz. Als Kosten dient dieselbe Rechnung wie überall: Kilometer plus Strafe je
 * offenem Blocker.
 *
 * Die Bremse ist das Kanten-Budget des Aufrufers: jede Expansion kostet einen
 * Routing-Aufruf, und `verzweigung` begrenzt, wie viele Nachbarn ein Knoten überhaupt
 * bekommt. Ohne beides würde der Korridor bei 4408 Knoten jede Zeitschranke sprengen.
 */
export async function sucheKette(start, ziel, { knoten = [], kante, maxTiefe = 4, verzweigung = 3, protokoll = [] } = {}) {
  const nachbarn = (n) => {
    // Nur vorwärts: ein Knoten HINTER dem aktuellen bringt keinen Fortschritt und
    // macht aus der Suche ein Herumirren im Korridor.
    const weiter = knoten.filter((k) => k.name !== n.name && (k.fortschritt ?? 0) > (n.fortschritt ?? 0) + 0.02)
    weiter.sort((a, b) => haversineKm(n, a) - haversineKm(n, b))
    return weiter.slice(0, verzweigung)
  }

  const offen = [{ knoten: start, ueber: [], teile: [], km: 0, blocker: [], schaetzung: haversineKm(start, ziel) }]
  const besucht = new Map() // Knotenname -> guenstigste bekannte Kosten dorthin
  let bestesZiel = null

  while (offen.length) {
    offen.sort((a, b) => kosten(a.km, a.blocker.length) + a.schaetzung - (kosten(b.km, b.blocker.length) + b.schaetzung))
    const jetzt = offen.shift()
    // Sobald das Ziel als günstigster Eintrag herauskommt, kann nichts Offenes mehr
    // besser werden — das ist die Abbruchbedingung von A*.
    if (bestesZiel && kosten(jetzt.km, jetzt.blocker.length) + jetzt.schaetzung >= bestesZiel.kosten) break
    // An der Tiefengrenze wird nicht abgebrochen, sondern nur noch der Weg zum Ziel
    // versucht — sonst endet die laengste Kette einen Schritt vor dem Ziel im Nichts.
    const weiter = jetzt.ueber.length >= maxTiefe ? [ziel] : [...nachbarn(jetzt.knoten), ziel]

    for (const n of weiter) {
      const k = await kante(jetzt.knoten, n)
      if (!k) continue // kein Budget mehr oder keine Route — beides beendet diesen Zweig
      const km = jetzt.km + k.distanzKm
      const blocker = [...jetzt.blocker, ...k.blocker]
      const teile = [...jetzt.teile, k]
      if (n === ziel) {
        const gesamt = kosten(km, blocker.length)
        if (!bestesZiel || gesamt < bestesZiel.kosten) {
          bestesZiel = { kosten: gesamt, km, blocker, teile, ueber: jetzt.ueber }
          protokoll.push({ art: "kette", ueber: jetzt.ueber, km: Math.round(km), blocker: blocker.length })
        }
        continue
      }
      const bisher = besucht.get(n.name)
      const hier = kosten(km, blocker.length)
      if (bisher != null && bisher <= hier) continue
      besucht.set(n.name, hier)
      offen.push({ knoten: n, ueber: [...jetzt.ueber, n.name], teile, km, blocker, schaetzung: haversineKm(n, ziel) })
    }
  }
  return bestesZiel
}

/**
 * Bidirektionale Korridorsuche über mehrere Knoten.
 *
 * Von Start UND Ziel wächst je eine Front über Autobahnknoten aufeinander zu. Jeder
 * erreichte Knoten merkt sich, was der Weg dorthin gekostet hat und welche Blocker
 * dabei liegen blieben. Am Ende wird jede Kombination „Knoten der Startfront ⇢ Knoten
 * der Zielfront" verbunden — die Strecke darf also über ZWEI Zwischenknoten laufen,
 * nicht nur über einen.
 *
 * Warum von beiden Seiten: Ein Blocker sitzt selten in der Mitte. Wer nur von vorne
 * sucht, arbeitet sich durch den halben Korridor, bevor er merkt, dass das Problem am
 * ZIEL liegt. Zwei Fronten halbieren die Tiefe und finden die Engstelle von der Seite,
 * auf der sie liegt.
 *
 * Jede Kante wird höchstens EINMAL gerechnet (Cache) — in einem Netz aus Knoten
 * tauchen dieselben Verbindungen sonst in jeder Kombination erneut auf.
 *
 * Das Budget ist die Bremse: `maxKanten` begrenzt die Routing-Aufrufe, `maxMs` die
 * Zeit. Beides wird protokolliert — eine Suche, die ins Budget läuft, sagt das, statt
 * so zu tun, als sei der Korridor erschöpft.
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
  const cache = new Map()
  let kanten = 0
  const budgetOffen = () => kanten < maxKanten && jetzt() - t0 < maxMs

  /** Kante holen — aus dem Cache oder frisch gerechnet, solange Budget da ist. */
  const kante = async (von, nach) => {
    const key = kantenSchluessel(von, nach)
    if (cache.has(key)) return cache.get(key)
    if (!budgetOffen()) return null
    kanten++
    const res = await sucheKante(von, nach, { blocker, route, protokoll })
    cache.set(key, res)
    return res
  }

  const S = { ...start, name: "Start" }
  const Z = { ...ziel, name: "Ziel" }

  // 1. Direkt. Ist der Weg frei, ist die Suche hier zu Ende — kein Grund, einen
  //    Korridor zu durchkämmen, für den es keine Frage gibt.
  const direkt = await kante(S, Z)
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

  // 2. Kandidatenknoten im Korridor, die dem Blocker am nächsten liegen: dort
  //    entscheidet sich, ob es überhaupt eine Ausweichachse gibt.
  const kandidaten = knotenImKorridor(start, ziel, knoten, { korridorKm })
  const naheAmBlocker = (k) => Math.min(...direkt.blocker.map((b) => haversineKm(k, b)))
  const sortiert = [...kandidaten].sort((a, b) => naheAmBlocker(a) - naheAmBlocker(b))
  const auswahl = sortiert.slice(0, breite * 2)
  protokoll.push({
    art: "korridor",
    knotenGefunden: kandidaten.length,
    blockerDirekt: direkt.blocker.length,
    ersteKandidaten: auswahl.slice(0, breite).map((k) => k.name),
  })

  // 3. Fronten aufbauen: die vordere Hälfte der Kandidaten von Start aus, die hintere
  //    vom Ziel aus — gemessen am Fortschritt entlang der Achse.
  const frontS = new Map()
  const frontZ = new Map()
  for (const k of auswahl) {
    if (!budgetOffen()) break
    if (k.fortschritt <= 0.6) {
      const hin = await kante(S, k)
      if (hin) frontS.set(k.name, { knoten: k, kante: hin, kosten: hin.kosten, blocker: hin.blocker })
    }
    if (k.fortschritt >= 0.4) {
      const her = await kante(k, Z)
      if (her) frontZ.set(k.name, { knoten: k, kante: her, kosten: her.kosten, blocker: her.blocker })
    }
  }
  protokoll.push({ art: "fronten", vonStart: [...frontS.keys()], zumZiel: [...frontZ.keys()] })

  /** Kandidatenstrecke bewerten und ggf. als neue Bestleistung übernehmen. */
  const pruefe = (teile, ueber) => {
    const gesamtBlocker = teile.flatMap((t) => t.blocker)
    const gesamtKm = teile.reduce((a, t) => a + t.distanzKm, 0)
    const k = kosten(gesamtKm, gesamtBlocker.length)
    const besser = k < beste.kosten
    protokoll.push({ art: "verbindung", ueber, km: Math.round(gesamtKm), blocker: gesamtBlocker.length, besserAlsBisher: besser })
    if (!besser) return
    beste.geometrie = teile.flatMap((t) => t.geometry)
    beste.distanzKm = gesamtKm
    beste.blocker = gesamtBlocker
    beste.kosten = k
    beste.ueber = ueber
  }

  // 4a. Ein Zwischenknoten: derselbe Knoten in beiden Fronten.
  for (const [name, a] of frontS) {
    const b = frontZ.get(name)
    if (b) pruefe([a.kante, b.kante], [name])
  }

  // 4b. Zwei Zwischenknoten: Startfront-Knoten ⇢ Zielfront-Knoten. Das ist der Fall,
  //     der eine echte Parallelachse abbildet — auf sie rauf, an der Sperre vorbei,
  //     wieder runter. Teuer, deshalb nach Aussicht sortiert und budgetgebremst.
  const paare = []
  for (const [nameA, a] of frontS) {
    for (const [nameB, b] of frontZ) {
      if (nameA === nameB) continue
      paare.push({ a, b, nameA, nameB, aussicht: a.kosten + b.kosten + haversineKm(a.knoten, b.knoten) })
    }
  }
  paare.sort((x, y) => x.aussicht - y.aussicht)
  for (const { a, b, nameA, nameB } of paare) {
    if (!budgetOffen()) break
    const mitte = await kante(a.knoten, b.knoten)
    if (!mitte) continue
    pruefe([a.kante, mitte, b.kante], [nameA, nameB])
  }

  // 4c. Reicht das nicht, ueber KETTEN suchen: drei, vier Zwischenknoten. Die Kanten
  //     der Fronten liegen im Cache, die Kette zahlt also nur fuer das, was neu ist.
  if (beste.blocker.length && budgetOffen()) {
    const kette = await sucheKette(S, Z, { knoten: auswahl, kante, protokoll })
    if (kette && kette.kosten < beste.kosten) {
      beste.geometrie = kette.teile.flatMap((t) => t.geometry)
      beste.distanzKm = kette.km
      beste.blocker = kette.blocker
      beste.kosten = kette.kosten
      beste.ueber = kette.ueber
      protokoll.push({ art: "verbindung", ueber: kette.ueber, km: Math.round(kette.km), blocker: kette.blocker.length, besserAlsBisher: true })
    }
  }

  // 5. Was jetzt noch auf der besten Strecke liegt, wird Stelle fuer Stelle lokal
  //    umfahren. Auf 800 km bleiben nach der Korridorwahl immer Einzelstellen liegen —
  //    sie einzeln abzuarbeiten ist stupide Arbeit und gehoert deshalb hierher.
  if (beste.blocker.length && budgetOffen()) {
    const vorher = beste.blocker.length
    const nachRep = await repariereBlocker(beste, {
      blocker,
      route: async (a, b, opt) => {
        if (!budgetOffen()) return []
        kanten++
        return route(a, b, opt)
      },
      protokoll,
      budget: budgetOffen,
    })
    if (nachRep.blocker.length < vorher) {
      beste.geometrie = nachRep.geometrie
      beste.blocker = nachRep.blocker
      beste.distanzKm = nachRep.distanzKm
      beste.kosten = kosten(nachRep.distanzKm, nachRep.blocker.length)
      protokoll.push({ art: "reparaturen", geloest: vorher - nachRep.blocker.length, offen: nachRep.blocker.length })
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

/**
 * Blocker-Karte: alle Hindernisse im Korridor, die für DIESEN Transport in DIESEM
 * Zeitraum kritisch sind — in einem einzigen Datenbankzugriff.
 *
 * Das ist der Trick, der die Suche schnell macht: die Bewertung „liegt das auf meiner
 * Kante?" ist danach reine Geometrie. Ohne diese Vorablast müsste jede Kandidaten-
 * Kante einzeln analysiert werden, und eine tiefe Suche wäre unbezahlbar.
 *
 * Bewusst nur `kritisch`: Warnungen und Hinweise sind für die Suche kein Kriterium,
 * sie gehören in die abschließende Analyse der gewählten Strecke.
 */
export async function ladeBlocker(db, { start, ziel, transport, zeitraum = {}, puffergrad = 0.7, tenantId = null }) {
  const latMin = Math.min(start.lat, ziel.lat) - puffergrad
  const latMax = Math.max(start.lat, ziel.lat) + puffergrad
  const lngMin = Math.min(start.lng, ziel.lng) - puffergrad
  const lngMax = Math.max(start.lng, ziel.lng) + puffergrad
  const { rows } = await db.query(
    `SELECT ${OBSTACLE_COLS} FROM obstacles
      WHERE aktiv = true
        AND (tenant_id IS NULL OR tenant_id = $5::uuid)
        AND lat BETWEEN $1 AND $2
        AND lng BETWEEN $3 AND $4
        AND kategorie <> ALL($6::text[])`,
    [latMin, latMax, lngMin, lngMax, tenantId, AUSWERTUNG_AUSGESCHLOSSEN],
  )
  const blocker = []
  for (const row of rows) {
    const o = rowToObstacle(row)
    const urteil = evaluate(o, transport, zeitraum)
    if (urteil?.severity !== "kritisch") continue
    blocker.push({
      id: o.id,
      lat: o.lat,
      lng: o.lng,
      titel: urteil.titel ?? o.name,
      kategorie: o.kategorie,
      strassenRef: o.strassenRef,
      gueltigVon: o.gueltigVon,
      gueltigBis: o.gueltigBis,
      grund: urteil.beschreibung ?? null,
    })
  }
  return blocker
}

/**
 * Ankerpunkte auf einer Geometrie: der Punkt `spielraumKm` vor und nach der Stelle.
 * Wegstrecke, nicht Luftlinie — sonst liegt der Anker bei einer Schleife falsch.
 */
export function anker(geometrie, stelle, spielraumKm = 15) {
  const linie = Array.isArray(geometrie) ? geometrie : []
  if (linie.length < 3) return null
  let mitte = 0
  let bestKm = Infinity
  for (let i = 0; i < linie.length; i++) {
    const d = haversineKm(stelle, linie[i])
    if (d < bestKm) {
      bestKm = d
      mitte = i
    }
  }
  let vor = mitte
  let kmVor = 0
  while (vor > 0 && kmVor < spielraumKm) {
    kmVor += haversineKm(linie[vor - 1], linie[vor])
    vor--
  }
  let nach = mitte
  let kmNach = 0
  while (nach < linie.length - 1 && kmNach < spielraumKm) {
    kmNach += haversineKm(linie[nach], linie[nach + 1])
    nach++
  }
  // Am Start oder Ziel gibt es nichts zu umfahren — die Route MUSS dorthin.
  if (kmVor < 2 || kmNach < 2 || nach - vor < 2) return null
  return { vor, mitte, nach, vorPunkt: linie[vor], nachPunkt: linie[nach] }
}

/**
 * Die verbliebenen Blocker einer Strecke der Reihe nach lokal umfahren.
 *
 * Das ist der Teil, der die schweren Fälle bewegt: Die Korridorsuche findet die beste
 * Achse, aber auf 800 km bleiben Einzelstellen liegen. Sie eine nach der anderen
 * abzuarbeiten ist stupide Arbeit — also macht sie die Engine, nicht das Modell.
 *
 * Je Stelle wird NUR das Stück zwischen den Ankern neu gesucht (mit Alternativen), und
 * das Ergebnis wird nur übernommen, wenn es den Blocker wirklich loswird UND nicht mehr
 * neue mitbringt, als es beseitigt. Ein Tausch ist erlaubt — ein schlechter nicht.
 */
export async function repariereBlocker(strecke, { blocker, route, maxStellen = 6, spielraeume = [15, 30], protokoll = [], budget = () => true } = {}) {
  let geo = strecke.geometrie
  let offen = [...(strecke.blocker ?? [])]
  let repariert = 0

  for (const stelle of [...offen].slice(0, maxStellen)) {
    if (!budget()) break
    let gelungen = false
    for (const spielraumKm of spielraeume) {
      if (!budget()) break
      const a = anker(geo, stelle, spielraumKm)
      if (!a) {
        protokoll.push({ art: "reparatur", stelle: stelle.titel ?? null, ergebnis: "am Start/Ziel, nicht umfahrbar" })
        break
      }
      const varianten = await route(a.vorPunkt, a.nachPunkt, { anzahl: 3 })
      if (!varianten?.length) continue

      const alt = geo.slice(a.vor, a.nach + 1)
      const altBlocker = blockerAufKante(alt, blocker).length
      let beste = null
      for (const v of varianten) {
        const treffer = blockerAufKante(v.geometry, blocker)
        // Der Ersatz muss DIESE Stelle loswerden und darf insgesamt nicht schlechter sein.
        const loestStelle = !treffer.some((t) => t.id === stelle.id || haversineKm(t, stelle) < 0.3)
        if (!loestStelle) continue
        if (treffer.length >= altBlocker) continue
        if (!beste || treffer.length < beste.treffer.length) beste = { ...v, treffer }
      }
      if (!beste) continue

      geo = [...geo.slice(0, a.vor), ...beste.geometry, ...geo.slice(a.nach + 1)]
      offen = blockerAufKante(geo, blocker)
      repariert++
      gelungen = true
      protokoll.push({
        art: "reparatur",
        stelle: stelle.titel ?? null,
        spielraumKm,
        ergebnis: "umfahren",
        offenDanach: offen.length,
      })
      break
    }
    if (!gelungen && budget()) {
      protokoll.push({ art: "reparatur", stelle: stelle.titel ?? null, ergebnis: "keine Umfahrung gefunden" })
    }
  }

  return { geometrie: geo, blocker: offen, repariert, distanzKm: laengeKmVon(geo) }
}

/** Länge einer Polylinie in km (die Reparatur ändert sie). */
function laengeKmVon(punkte) {
  const linie = Array.isArray(punkte) ? punkte : []
  let summe = 0
  for (let i = 1; i < linie.length; i++) summe += haversineKm(linie[i - 1], linie[i])
  return summe
}
