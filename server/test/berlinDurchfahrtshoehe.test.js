// Berlin Durchfahrtshöhen (0133): Raster-Cluster je ~33m, niedrigste Höhe je Ort behalten.
import { afterEach, describe, expect, it, vi } from "vitest"
import { berlinDurchfahrtshoehenConnector as conn } from "../src/connectors/0133_berlin_durchfahrtshoehe.js"

const fc = {
  type: "FeatureCollection",
  numberMatched: 4,
  features: [
    // Zwei Punkte am selben Ort (fahrstreifenscharf): nur das Minimum (3,8) bleibt.
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.1",
      geometry: { type: "Point", coordinates: [13.40018, 52.49014] },
      properties: { hoehe: 4.2 },
    },
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.2",
      geometry: { type: "Point", coordinates: [13.40019, 52.49015] },
      properties: { hoehe: 3.8 },
    },
    // Klar entfernter Ort (~1 km) → eigene Zelle.
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.3",
      geometry: { type: "Point", coordinates: [13.42, 52.5] },
      properties: { hoehe: 5 },
    },
    // ohne verwertbare Höhe → verworfen
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.4",
      geometry: { type: "Point", coordinates: [13.43, 52.51] },
      properties: { hoehe: 0 },
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("Berlin Durchfahrtshöhen 0133", () => {
  it("clustert je ~33m und behält die niedrigste (bindende) Höhe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })

    // 2 Orte: der zusammengefasste Punkt 1/2 + der entfernte Punkt 3; Punkt 4 (hoehe 0) raus.
    expect(obstacles).toHaveLength(2)

    const tief = obstacles.find((o) => o.attrs.maxHoeheM === 3.8)
    expect(tief).toBeTruthy()
    expect(tief.kategorie).toBe("bruecke")
    expect(tief.name).toBe("Durchfahrtshöhe 3,8 m") // Minimum gewinnt
    expect(tief.externeId).toMatch(/^be-h#/) // rasterstabile ID
    expect(tief.kiAufbereitet).toBe(false)

    expect(obstacles.find((o) => o.attrs.maxHoeheM === 5)).toBeTruthy()
    // Der 4,2er Punkt wurde vom 3,8er verdrängt (selbe Zelle)
    expect(obstacles.find((o) => o.attrs.maxHoeheM === 4.2)).toBeFalsy()
  })
})
