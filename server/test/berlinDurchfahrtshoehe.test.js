// Berlin Durchfahrtshöhen (0133): GeoJSON-Mapping → bruecke + maxHoeheM, EPSG:4326 (kein Reproj).
import { afterEach, describe, expect, it, vi } from "vitest"
import { berlinDurchfahrtshoehenConnector as conn } from "../src/connectors/0133_berlin_durchfahrtshoehe.js"

const fc = {
  type: "FeatureCollection",
  numberMatched: 3,
  features: [
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.1",
      geometry: { type: "Point", coordinates: [13.40018958, 52.49014675] },
      properties: { bezeichnun: "Durchfahrtshoehe", gis_id: "Pk_1", hoehe: 5.2 },
    },
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.2",
      geometry: { type: "Point", coordinates: [13.4005, 52.4906] },
      properties: { gis_id: "Pk_2", hoehe: 3 },
    },
    // ohne verwertbare Höhe → kein Fund
    {
      type: "Feature",
      id: "al_durchfahrtshoehe.3",
      geometry: { type: "Point", coordinates: [13.41, 52.5] },
      properties: { gis_id: "Pk_3", hoehe: 0 },
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("Berlin Durchfahrtshöhen 0133", () => {
  it("mappt Höhenpunkte → bruecke mit maxHoeheM (WGS84, kein Reproj), droppt hoehe<=0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })

    expect(obstacles).toHaveLength(2) // Pk_3 (hoehe 0) verworfen

    const a = obstacles[0]
    expect(a.kategorie).toBe("bruecke")
    expect(a.externeId).toBe("al_durchfahrtshoehe.1")
    expect(a.name).toBe("Durchfahrtshöhe 5,2 m")
    expect(a.lat).toBeCloseTo(52.49014675, 6)
    expect(a.lng).toBeCloseTo(13.40018958, 6)
    expect(a.attrs.maxHoeheM).toBe(5.2)
    expect(a.kiAufbereitet).toBe(false) // strukturierte Quelle, keine Freitext-Extraktion

    expect(obstacles[1].attrs.maxHoeheM).toBe(3)
  })
})
