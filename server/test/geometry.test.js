// Geometrie: Haversine-Sanity, Punkt→Segment-Distanz, km-entlang-Position.

import { describe, expect, it } from "vitest"
import { bboxWithBuffer, cumulativeKm, haversineKm, nearestOnRoute, totalKm } from "../src/engine/geometry.js"

const HH = { lat: 53.5511, lng: 9.9937 }
const M = { lat: 48.1351, lng: 11.582 }

describe("haversineKm", () => {
  it("Hamburg → München ≈ 612 km (Luftlinie)", () => {
    const d = haversineKm(HH, M)
    expect(d).toBeGreaterThan(580)
    expect(d).toBeLessThan(640)
  })

  it("identische Punkte → 0", () => {
    expect(haversineKm(HH, HH)).toBe(0)
  })
})

describe("cumulativeKm / totalKm", () => {
  it("monoton steigend, letzter Wert = Gesamtdistanz", () => {
    const pts = [HH, { lat: 52.3759, lng: 9.732 }, M]
    const cum = cumulativeKm(pts)
    expect(cum[0]).toBe(0)
    expect(cum[1]).toBeGreaterThan(0)
    expect(cum[2]).toBeGreaterThan(cum[1])
    expect(cum[2]).toBeCloseTo(totalKm(pts), 9)
  })
})

describe("nearestOnRoute", () => {
  // West-Ost-Segment auf 50° N: 1° lng ≈ 71,7 km
  const seg = [{ lat: 50, lng: 8 }, { lat: 50, lng: 9 }]

  it("Punkt 0,001° nördlich der Segmentmitte → ~111 m, km ≈ Mitte", () => {
    const { distM, km } = nearestOnRoute({ lat: 50.001, lng: 8.5 }, seg)
    expect(distM).toBeGreaterThan(105)
    expect(distM).toBeLessThan(118)
    const half = haversineKm(seg[0], seg[1]) / 2
    expect(km).toBeCloseTo(half, 0)
  })

  it("Punkt exakt auf der Linie → ~0 m", () => {
    const { distM } = nearestOnRoute({ lat: 50, lng: 8.25 }, seg)
    expect(distM).toBeLessThan(1)
  })

  it("Punkt hinter dem Segmentende clampt auf den Endpunkt", () => {
    const { distM, km } = nearestOnRoute({ lat: 50, lng: 9.5 }, seg)
    const expected = haversineKm({ lat: 50, lng: 9 }, { lat: 50, lng: 9.5 }) * 1000
    expect(distM).toBeCloseTo(expected, -3) // grobe Meter-Toleranz
    expect(km).toBeCloseTo(haversineKm(seg[0], seg[1]), 1)
  })

  it("wählt das nächste von mehreren Segmenten", () => {
    const route = [
      { lat: 50, lng: 8 }, { lat: 50, lng: 9 },
      { lat: 51, lng: 9 }, { lat: 51, lng: 10 },
    ]
    const nearSecondLeg = nearestOnRoute({ lat: 50.5, lng: 9.0005 }, route)
    expect(nearSecondLeg.distM).toBeLessThan(100)
    expect(nearSecondLeg.km).toBeGreaterThan(haversineKm(route[0], route[1]))
  })
})

describe("bboxWithBuffer", () => {
  it("umschließt alle Punkte mit Puffer", () => {
    const box = bboxWithBuffer([HH, M], 120)
    expect(box.minLat).toBeLessThan(M.lat)
    expect(box.maxLat).toBeGreaterThan(HH.lat)
    expect(box.minLng).toBeLessThan(HH.lng)
    expect(box.maxLng).toBeGreaterThan(M.lng)
    // Puffer in der richtigen Größenordnung (~0,001° für 120 m)
    expect(M.lat - box.minLat).toBeLessThan(0.01)
  })
})
