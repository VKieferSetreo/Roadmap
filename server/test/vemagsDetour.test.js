import { describe, it, expect } from "vitest"
import { dropDetours } from "../src/routes/route.js"

// T-567: Ausreißer-Filter für Fehl-Geocodes mehrdeutiger VEMAGS-Wegpunktnamen.
describe("dropDetours (VEMAGS-Wegpunkt-Ausreißer)", () => {
  it("verwirft einen Punkt, der einen großen Umweg erzwingt (z.B. Borsigstraße→Berlin)", () => {
    // Ostfriesland-Korridor mit einem fälschlich nach Berlin geokodierten Zwischenpunkt.
    const pts = [
      { lat: 53.31, lng: 7.59, raw: "Hesel" },
      { lat: 52.53, lng: 13.39, raw: "Borsigstraße" }, // Berlin — Ausreißer
      { lat: 53.51, lng: 7.51, raw: "Kreihüttenmoorweg" },
      { lat: 53.47, lng: 7.48, raw: "Aurich" },
    ]
    const { kept, dropped } = dropDetours(pts)
    expect(dropped.map((d) => d.raw)).toEqual(["Borsigstraße"])
    expect(kept.map((k) => k.raw)).toEqual(["Hesel", "Kreihüttenmoorweg", "Aurich"])
  })

  it("behält Punkte auf dem Korridor (kein unplausibler Umweg)", () => {
    const pts = [
      { lat: 48.47, lng: 7.9, raw: "Offenburg" },
      { lat: 50.81, lng: 9.51, raw: "Hattenbach" },
      { lat: 52.78, lng: 9.67, raw: "Walsrode" },
      { lat: 53.26, lng: 7.54, raw: "Leer" },
    ]
    expect(dropDetours(pts).dropped).toHaveLength(0)
  })

  it("Start/Ziel bleiben unangetastet, ≤2 Punkte unverändert", () => {
    const two = [{ lat: 1, lng: 1, raw: "a" }, { lat: 2, lng: 2, raw: "b" }]
    expect(dropDetours(two).kept).toHaveLength(2)
    expect(dropDetours(two).dropped).toHaveLength(0)
  })
})
