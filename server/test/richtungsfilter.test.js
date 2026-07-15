// Gegenfahrbahn-Filter: Bearing-Helfer + Filter-Entscheidung (parallel behalten,
// antiparallel droppen, Punkte/kurze Linien NIE droppen).
import { describe, it, expect } from "vitest"
import {
  angleDeltaDeg, cumulativeKm, lineBearingDeg, lineCrossesRoute, lineOffRoute, obstacleRouteRelation, routeBearingAtKm,
} from "../src/engine/geometry.js"

const nordLinie = [{ lat: 50.0, lng: 8.0 }, { lat: 50.5, lng: 8.0 }]
const suedLinie = [{ lat: 50.5, lng: 8.0 }, { lat: 50.0, lng: 8.0 }]

describe("lineBearingDeg", () => {
  it("Nord-Linie ≈ 0°", () => {
    expect(lineBearingDeg(nordLinie)).toBeCloseTo(0, 0)
  })
  it("Süd-Linie ≈ 180°", () => {
    expect(lineBearingDeg(suedLinie)).toBeCloseTo(180, 0)
  })
  it("zu kurze Linie (<120 m) → null (kein Filtern)", () => {
    expect(lineBearingDeg([{ lat: 50.0, lng: 8.0 }, { lat: 50.0005, lng: 8.0 }])).toBeNull()
  })
  it("Punkt/Einzelpunkt → null", () => {
    expect(lineBearingDeg([{ lat: 50, lng: 8 }])).toBeNull()
    expect(lineBearingDeg(null)).toBeNull()
  })
})

describe("routeBearingAtKm", () => {
  it("Nord-Route ≈ 0° in der Mitte", () => {
    const geo = nordLinie
    const cum = cumulativeKm(geo)
    expect(routeBearingAtKm(geo, cum, cum[cum.length - 1] / 2)).toBeCloseTo(0, 0)
  })
})

describe("angleDeltaDeg", () => {
  it("entgegengesetzt = 180", () => expect(angleDeltaDeg(0, 180)).toBe(180))
  it("über die 360-Grenze", () => expect(angleDeltaDeg(350, 10)).toBe(20))
  it("symmetrisch", () => expect(angleDeltaDeg(120, 0)).toBe(120))
})

describe("obstacleRouteRelation (auf-Fahrbahn behalten, versetzte Gegenfahrbahn droppen)", () => {
  const route = [{ lat: 50.0, lng: 8.0 }, { lat: 50.5, lng: 8.0 }] // Nord-Route bei lng 8.0
  const cum = cumulativeKm(route)
  it("gleiche Richtung auf unserer Fahrbahn → parallel (behalten)", () => {
    const linie = [{ lat: 50.1, lng: 8.0 }, { lat: 50.4, lng: 8.0 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).toBe("parallel")
  })
  it("Koords umgekehrt, aber AUF unserer Fahrbahn → parallel (nicht droppen — physisch unsere Straße)", () => {
    const linie = [{ lat: 50.4, lng: 8.0 }, { lat: 50.1, lng: 8.0 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).toBe("parallel")
  })
  it("versetzte Gegenfahrbahn (~28 m daneben, gegenläufig) → opposite (droppen)", () => {
    const linie = [{ lat: 50.4, lng: 8.0004 }, { lat: 50.1, lng: 8.0004 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).toBe("opposite")
  })
  it("ENG benachbarte Gegenfahrbahn (~12 m, schmaler Mittelstreifen, gegenläufig) → opposite (Bug-Fix: vorher fälschlich behalten)", () => {
    // ~12 m Versatz: über dem Same-Lane-Radius (8 m), unter dem alten coincidentM (20 m).
    const linie = [{ lat: 50.4, lng: 8.000168 }, { lat: 50.1, lng: 8.000168 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).toBe("opposite")
  })
  it("versetzt, aber gleichläufig (Nebenfahrbahn gleiche Richtung) → nicht droppen", () => {
    const linie = [{ lat: 50.1, lng: 8.0004 }, { lat: 50.4, lng: 8.0004 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).not.toBe("opposite")
  })
  it("abseits der Route → none (behalten)", () => {
    const linie = [{ lat: 60.0, lng: 20.0 }, { lat: 60.2, lng: 20.0 }]
    expect(obstacleRouteRelation(linie, route, cum, {})).toBe("none")
  })
  it("Punkt / <2 Stützpunkte → none (nie droppen)", () => {
    expect(obstacleRouteRelation([{ lat: 50.2, lng: 8.0 }], route, cum, {})).toBe("none")
  })
})

describe("lineCrossesRoute (T-611: quer kreuzende Linien droppen, längs-versetzte behalten)", () => {
  const route = [{ lat: 50.0, lng: 8.0 }, { lat: 50.5, lng: 8.0 }] // Nord-Route bei lng 8.0
  const cum = cumulativeKm(route)
  it("quer kreuzende E-W-Linie (2 Punkte, Mittelpunkt auf Route) → crossing (droppen)", () => {
    const linie = [{ lat: 50.25, lng: 7.99 }, { lat: 50.25, lng: 8.01 }]
    expect(lineCrossesRoute(linie, route, cum)).toBe(true)
  })
  it("auf der Route entlang → kein crossing (behalten)", () => {
    const linie = [{ lat: 50.1, lng: 8.0 }, { lat: 50.4, lng: 8.0 }]
    expect(lineCrossesRoute(linie, route, cum)).toBe(false)
  })
  it("durch Mittelstreifen ~12 m versetzt, aber GLEICHLAUFEND → kein crossing (Max: nichts übersehen)", () => {
    const linie = [{ lat: 50.1, lng: 8.000168 }, { lat: 50.4, lng: 8.000168 }]
    expect(lineCrossesRoute(linie, route, cum)).toBe(false)
  })
  it("Punkt / <2 Stützpunkte → nie crossing", () => {
    expect(lineCrossesRoute([{ lat: 50.25, lng: 8.0 }], route, cum)).toBe(false)
  })
  it("abseits der Route → kein crossing", () => {
    expect(lineCrossesRoute([{ lat: 60.0, lng: 20.0 }, { lat: 60.0, lng: 20.1 }], route, cum)).toBe(false)
  })
})

describe("lineOffRoute (T-641: tangentiale Rampen/Fremdstraßen droppen, Befahrenes behalten)", () => {
  const route = [{ lat: 50.0, lng: 8.0 }, { lat: 50.5, lng: 8.0 }] // Nord-Route bei lng 8.0
  const cum = cumulativeKm(route)
  it("Rampe: berührt die Route tangential (~22 m Mitlauf), biegt dann weit ab → droppen", () => {
    // wie eine AS-/Kreuz-Rampe: kurzes Stück am Berührpunkt parallel, Rest läuft > 60 m abseits
    const rampe = [[
      { lat: 50.25, lng: 8.0 }, { lat: 50.2502, lng: 8.0 }, // ~22 m auf der Route (unter 35-m-Mitlauf)
      { lat: 50.2503, lng: 8.0015 }, // scharf nach Osten weg (~107 m)
      { lat: 50.2503, lng: 8.005 }, // weiter Richtung Osten (~360 m) — > 150 m klar abseits
    ]]
    expect(lineOffRoute(rampe, route, cum)).toBe(true)
  })
  it("kurze Baustelle komplett auf der Route (kein Abseits-Stück) → behalten", () => {
    const linie = [[{ lat: 50.25, lng: 8.0 }, { lat: 50.2504, lng: 8.0 }]]
    expect(lineOffRoute(linie, route, cum)).toBe(false)
  })
  it("teil-befahrene lange Baustelle (Route verlässt sie unterwegs) → behalten (Early-Exit)", () => {
    const linie = [[
      { lat: 50.25, lng: 8.0 }, { lat: 50.251, lng: 8.0 }, // ~111 m Mitlauf auf der Route
      { lat: 50.251, lng: 8.01 }, // danach ~715 m abseits (jenseits der Abzweigung)
    ]]
    expect(lineOffRoute(linie, route, cum)).toBe(false)
  })
  it("durch Mittelstreifen ~12 m versetzt, gleichlaufend über die ganze Länge → behalten", () => {
    const linie = [[{ lat: 50.1, lng: 8.000168 }, { lat: 50.4, lng: 8.000168 }]]
    expect(lineOffRoute(linie, route, cum)).toBe(false)
  })
  it("Punkt / leere Teil-Linien → nie droppen", () => {
    expect(lineOffRoute([[{ lat: 50.25, lng: 8.0 }]], route, cum)).toBe(false)
    expect(lineOffRoute([], route, cum)).toBe(false)
    expect(lineOffRoute(null, route, cum)).toBe(false)
  })
  it("MultiLineString-Teile getrennt: Phantom-Sprung zwischen zwei On-Route-Teilen darf kein Abseits beweisen", () => {
    // L-Route: nach Norden, dann nach Osten. Zwei KURZE echte Teil-Linien, beide sauber AUF der
    // Route — die (nicht existente) Verbindung dazwischen schneidet die Kurve > 60 m ab.
    const lRoute = [{ lat: 50.0, lng: 8.0 }, { lat: 50.25, lng: 8.0 }, { lat: 50.25, lng: 8.4 }]
    const lCum = cumulativeKm(lRoute)
    const teilA = [{ lat: 50.2, lng: 8.0 }, { lat: 50.20012, lng: 8.0 }] // ~13 m auf dem Nord-Schenkel
    const teilB = [{ lat: 50.25, lng: 8.07 }, { lat: 50.25, lng: 8.0702 }] // ~14 m auf dem Ost-Schenkel
    // Phantom-Sprung teilA→teilB läuft mit ~42° — quer zu BEIDEN Schenkeln (kein Mitlauf-Artefakt)
    expect(lineOffRoute([teilA, teilB], lRoute, lCum)).toBe(false) // echte Geometrie: nichts abseits
    // geflattet (Alt-Verhalten) würde der Phantom-Sprung ~6 km "Abseits" erfinden und droppen:
    expect(lineOffRoute([[...teilA, ...teilB]], lRoute, lCum)).toBe(true)
  })
})

describe("Filter-Entscheidung (Schwelle 120°)", () => {
  const route = nordLinie
  const cum = cumulativeKm(route)
  const rBear = routeBearingAtKm(route, cum, cum[cum.length - 1] / 2)
  it("gleiche Richtung → behalten (delta ≤ 120)", () => {
    expect(angleDeltaDeg(lineBearingDeg(nordLinie), rBear)).toBeLessThanOrEqual(120)
  })
  it("Gegenfahrbahn → droppen (delta > 120)", () => {
    expect(angleDeltaDeg(lineBearingDeg(suedLinie), rBear)).toBeGreaterThan(120)
  })
})
