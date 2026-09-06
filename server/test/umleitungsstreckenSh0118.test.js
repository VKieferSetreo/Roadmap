// SH Umleitungsstrecken (0118): die Attributnamen des Dienstes sind schreibweise-instabil.
// Im Juni 2026 lieferte er GROSSSCHREIBUNG (STRECKENFÜHRUNG, GÜLTIGKEIT, ZUSÄTZLICHER_…),
// im September die gemischte Schreibweise der ArcGIS-Feld-Aliase (Streckenführung, Gültigkeit,
// Zusätzlicher_Zeitbedarf_in_min). Der starre Zugriff auf die alten Keys lieferte still undefined:
// jeder Fund hiess nur noch "Umleitungsstrecke", ohne Beschreibung und ohne Zeitraum — worauf der
// Dedup (kategorie|name|ort) sie zu Ortsgruppen verschmolz und der Reconcile-Guard aussetzte.
// Beide Schreibweisen muessen gelesen werden.
import { afterEach, describe, expect, it, vi } from "vitest"
import { umleitungsstreckenShConnector as conn } from "../src/connectors/0118_umleitungsstrecken_sh.js"

const linie = (lng, lat) => ({
  type: "MultiLineString",
  coordinates: [[[lng, lat], [lng + 0.01, lat + 0.01]]],
})

const fc = {
  type: "FeatureCollection",
  features: [
    // heutige Schreibweise (ArcGIS-Aliase)
    {
      type: "Feature",
      geometry: linie(10.47753, 53.50461),
      properties: {
        OBJECTID: 3,
        Streckenführung: "Möllner Straße - Kerntangente - Grabauer Straße",
        Gültigkeit: "2026-08-14 - 2026-09-26",
        Mehrweg_in_km: 0.9,
        Zusätzlicher_Zeitbedarf_in_min: 1,
      },
    },
    // frühere Schreibweise — darf nicht zurückfallen, falls der Betreiber zurückrudert
    {
      type: "Feature",
      geometry: linie(9.8, 54.3),
      properties: {
        OBJECTID: 7,
        STRECKENFÜHRUNG: "Tönninger Straße - Witzworter Straße",
        GÜLTIGKEIT: "2026-05-18 - 2027-03-23",
        Mehrweg_in_km: 6.3,
        ZUSÄTZLICHER_ZEITBEDARF_IN_MIN: 9,
      },
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("SH Umleitungsstrecken 0118", () => {
  it("liest die Attribute unabhängig von der Schreibweise des Dienstes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => fc,
    })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(2)

    const [neu, alt] = obstacles

    // Der Name trägt die Streckenführung — er ist der Diskriminator des Dedups.
    expect(neu.externeId).toBe("3")
    expect(neu.name).toBe("Umleitungsstrecke Möllner Straße - Kerntangente - Grabauer Straße")
    expect(neu.beschreibung).toBe("Möllner Straße - Kerntangente - Grabauer Straße")
    expect(neu.gueltigVon).toBe("2026-08-14")
    expect(neu.gueltigBis).toBe("2026-09-26") // ohne Enddatum kann die Hygiene nie ablaufen lassen
    expect(neu.attrs.mehrwegKm).toBe(0.9)
    expect(neu.attrs.zusatzzeitMin).toBe(1)
    expect(neu.attrs.umleitung).toBe(true)
    expect(neu.geom.type).toBe("MultiLineString") // Korridor bleibt Linie (T-431)

    expect(alt.externeId).toBe("7")
    expect(alt.name).toBe("Umleitungsstrecke Tönninger Straße - Witzworter Straße")
    expect(alt.gueltigVon).toBe("2026-05-18")
    expect(alt.gueltigBis).toBe("2027-03-23")
    expect(alt.attrs.zusatzzeitMin).toBe(9)

    // Zwei verschiedene Strecken müssen zwei verschiedene Namen haben, sonst verschmilzt der Dedup sie.
    expect(new Set(obstacles.map((o) => o.name)).size).toBe(2)
  })
})
