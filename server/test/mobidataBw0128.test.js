// 0128 BEMaS: Strecken-Geometrie muss durchgereicht werden (vorher auf Punkt kollabiert),
// Punkt-Features bleiben Punkt-Meldungen.
import { describe, it, expect, vi, afterEach } from "vitest"
import { mobidataBwBaustellenConnector as conn } from "../src/connectors/0128_mobidata_bw_baustellen.js"

const fc = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "L1", type: "CONSTRUCTION", street: "L1100 Stuttgart", description: "Fahrbahnerneuerung", starttime: "2026-07-01T00:00:00Z", endtime: "2026-08-15T00:00:00Z", direction: "BOTH_DIRECTIONS" },
      geometry: { type: "LineString", coordinates: [[9.18, 48.78], [9.20, 48.79], [9.22, 48.80]] } },
    { type: "Feature", properties: { id: "P1", type: "ROAD_CLOSED", street: "K1077", description: "Vollsperrung Brückenbau", starttime: "2026-07-10T00:00:00Z", endtime: "2026-07-20T00:00:00Z", direction: "ONE_DIRECTION" },
      geometry: { type: "Point", coordinates: [9.30, 48.85] } },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("0128 BEMaS — Strecken-Geometrie", () => {
  it("reicht LineString als geom durch (Linien-Render + Gegenfahrbahn-Filter)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({})
    expect(obstacles).toHaveLength(2)

    const linie = obstacles.find((o) => o.externeId === "L1")
    expect(linie.geom).toEqual({ type: "LineString", coordinates: [[9.18, 48.78], [9.20, 48.79], [9.22, 48.80]] })
    expect(linie.lat).toBeCloseTo(48.78, 4) // Marker-Punkt = erster Stützpunkt
    expect(linie.lng).toBeCloseTo(9.18, 4)
    expect(linie.kategorie).toBe("baustelle")

    const punkt = obstacles.find((o) => o.externeId === "P1")
    expect(punkt.geom).toBeNull() // Punkt-Feature bleibt Punkt-Meldung
    expect(punkt.kategorie).toBe("sperrung")
  })

  it("T-442: führt .NNN-Segmente derselben Baustelle zu EINEM MultiLineString-Fund zusammen", async () => {
    const segmented = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { id: "B7-bau.001", type: "CONSTRUCTION", street: "B7", description: "Fahrbahnerneuerung", starttime: "2026-07-01T00:00:00Z", endtime: "2026-08-15T00:00:00Z" },
          geometry: { type: "LineString", coordinates: [[9.10, 48.70], [9.11, 48.71]] } },
        { type: "Feature", properties: { id: "B7-bau.002", type: "CONSTRUCTION", street: "B7", description: "Fahrbahnerneuerung", starttime: "2026-07-01T00:00:00Z", endtime: "2026-08-15T00:00:00Z" },
          geometry: { type: "LineString", coordinates: [[9.11, 48.71], [9.13, 48.72]] } },
      ],
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => segmented })
    const { obstacles } = await conn.fetch({})
    expect(obstacles).toHaveLength(1) // statt 2 zersplitterter Funde
    expect(obstacles[0].externeId).toBe("B7-bau") // Stamm-ID ohne .NNN
    expect(obstacles[0].geom.type).toBe("MultiLineString")
    expect(obstacles[0].geom.coordinates).toHaveLength(2)
  })
})
