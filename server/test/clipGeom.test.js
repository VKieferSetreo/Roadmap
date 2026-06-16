// clipGeomToCorridor: behält nur den Teil der Hindernis-Linie im Routen-Korridor.
import { describe, it, expect } from "vitest"
import { clipGeomToCorridor, cumulativeKm } from "../src/engine/geometry.js"

// Route: gerade Ost-West-Linie bei lat 50 (lng 7.000 → 7.010).
const route = [{ lat: 50, lng: 7.0 }, { lat: 50, lng: 7.01 }]
const cum = cumulativeKm(route)
const CLIP = 60

describe("clipGeomToCorridor", () => {
  it("clippt eine Linie, die erst auf der Route läuft und dann weit abbiegt", () => {
    // 7.001→7.004 exakt auf der Route (lat 50), dann scharf nach Norden bis lat 50.010 (~1,1 km weg)
    const geom = { type: "LineString", coordinates: [[7.001, 50.0], [7.004, 50.0], [7.004, 50.01]] }
    const out = clipGeomToCorridor(geom, route, cum, CLIP)
    expect(out).not.toBeNull()
    expect(out.type).toBe("LineString")
    const lats = out.coordinates.map((c) => c[1])
    const lngs = out.coordinates.map((c) => c[0])
    expect(Math.max(...lats)).toBeLessThan(50.001) // der Nord-Schwenk ist abgeschnitten
    expect(Math.min(...lngs)).toBeGreaterThanOrEqual(7.0005) // beginnt am durchfahrenen Stück
    expect(Math.max(...lngs)).toBeLessThanOrEqual(7.0045)
  })

  it("liefert null, wenn die Linie komplett außerhalb des Korridors liegt", () => {
    const geom = { type: "LineString", coordinates: [[7.001, 50.02], [7.004, 50.02]] } // ~2,2 km nördlich
    expect(clipGeomToCorridor(geom, route, cum, CLIP)).toBeNull()
  })

  it("ignoriert Nicht-Linien (Punkt → null)", () => {
    expect(clipGeomToCorridor({ type: "Point", coordinates: [7.005, 50] }, route, cum, CLIP)).toBeNull()
  })
})
