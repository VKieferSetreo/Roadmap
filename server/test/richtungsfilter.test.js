// Gegenfahrbahn-Filter: Bearing-Helfer + Filter-Entscheidung (parallel behalten,
// antiparallel droppen, Punkte/kurze Linien NIE droppen).
import { describe, it, expect } from "vitest"
import {
  angleDeltaDeg, cumulativeKm, lineBearingDeg, obstacleRouteRelation, routeBearingAtKm,
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

describe("obstacleRouteRelation (Korridor 20 m, lokal + längen-gewichtet)", () => {
  const route = [{ lat: 50.0, lng: 8.0 }, { lat: 50.5, lng: 8.0 }] // Nord-Route
  const cum = cumulativeKm(route)
  it("gleiche Richtung auf der Route → parallel (behalten)", () => {
    const linie = [{ lat: 50.1, lng: 8.0 }, { lat: 50.4, lng: 8.0 }]
    expect(obstacleRouteRelation(linie, route, cum, 20)).toBe("parallel")
  })
  it("Gegenrichtung auf der Route → opposite (droppen)", () => {
    const linie = [{ lat: 50.4, lng: 8.0 }, { lat: 50.1, lng: 8.0 }]
    expect(obstacleRouteRelation(linie, route, cum, 20)).toBe("opposite")
  })
  it("abseits der Route → none (behalten)", () => {
    const linie = [{ lat: 60.0, lng: 20.0 }, { lat: 60.2, lng: 20.0 }]
    expect(obstacleRouteRelation(linie, route, cum, 20)).toBe("none")
  })
  it("Hin-und-zurück-Linie über der Route → parallel (Gleichrichtungs-Anteil zählt)", () => {
    const linie = [{ lat: 50.1, lng: 8.0 }, { lat: 50.4, lng: 8.0 }, { lat: 50.1, lng: 8.0 }]
    expect(obstacleRouteRelation(linie, route, cum, 20)).toBe("parallel")
  })
  it("Punkt / <2 Stützpunkte → none (nie droppen)", () => {
    expect(obstacleRouteRelation([{ lat: 50.2, lng: 8.0 }], route, cum, 20)).toBe("none")
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
