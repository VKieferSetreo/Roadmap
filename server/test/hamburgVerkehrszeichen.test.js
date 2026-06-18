// Hamburg Verkehrszeichen (0134): vz_nr-Suffix → Höhe/Gewicht/Breite, EPSG:4326 (kein Reproj).
import { afterEach, describe, expect, it, vi } from "vitest"
import { hamburgVerkehrszeichenConnector as conn } from "../src/connectors/0134_hamburg_verkehrszeichen.js"

const feat = (id, vz_nr, lng, lat, strassenname) => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { vz_nr, id: Number(id.split("_").pop()), strassenname },
})

const fc = {
  type: "FeatureCollection",
  features: [
    feat("VZ_1", "265-3,8", 9.99, 53.55, "Moorburger Straße"), // Höhe
    feat("VZ_2", "262-7,5", 9.98, 53.54, "Klütjenfelder Straße"), // Gewicht
    feat("VZ_3", "264-2,1", 9.97, 53.53, "Steinwerder Damm"), // Breite
    feat("VZ_4", "306", 9.96, 53.52, "Irgendweg"), // kein Beschränkungs-Schild → dropped
    feat("VZ_5", "265", 9.95, 53.51, "Ohnewert"), // 265 ohne Wert-Suffix → dropped
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("Hamburg Verkehrszeichen 0134", () => {
  it("mappt vz_nr-Suffix → bruecke/gewicht/engstelle, droppt Nicht-Beschränkungen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })

    expect(obstacles).toHaveLength(3) // 306 + wertloses 265 verworfen

    const hoehe = obstacles.find((o) => o.kategorie === "bruecke")
    expect(hoehe.name).toBe("Durchfahrtshöhe 3,8 m")
    expect(hoehe.attrs.maxHoeheM).toBe(3.8)
    expect(hoehe.lat).toBeCloseTo(53.55, 5)
    expect(hoehe.lng).toBeCloseTo(9.99, 5)
    expect(hoehe.kiAufbereitet).toBe(false)

    const gewicht = obstacles.find((o) => o.kategorie === "gewicht")
    expect(gewicht.attrs.maxGewichtT).toBe(7.5)
    expect(gewicht.name).toBe("Gewichtsbeschränkung 7,5 t")

    const breite = obstacles.find((o) => o.kategorie === "engstelle")
    expect(breite.attrs.maxBreiteM).toBe(2.1)
    expect(breite.kiAufbereitet).toBe(false) // restbreiteM mitgesetzt → keine Falsch-Extraktion
  })
})
