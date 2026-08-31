// Ortsdurchfahrt-Erkennung, Engine-Seite (Konzept „Ortschaften umfahren"):
//  - osrm.roadSegments zerlegt die Route aus den OSRM-Steps in geordnete Abschnitte
//    mit Ref(s), Name, km-Bereich und Mittelpunkt.
//  - ergaenzeOrtsklassen reichert NUR No-Ref-Abschnitte per Nominatim-Reverse mit der
//    OSM-highway-Klasse an, gedeckelt und dedupliziert.
// Beides ohne echtes OSRM/Nominatim: Fake-fetchImpl bzw. Fake-Nominatim.

import { describe, expect, it, vi } from "vitest"
import { createOsrm } from "../src/external/osrm.js"
import { ergaenzeOrtsklassen } from "../src/routes/route.js"

const OSRM_STEPS = {
  code: "Ok",
  routes: [
    {
      legs: [
        {
          steps: [
            { distance: 12000, ref: "A 5", name: "", geometry: { coordinates: [[8.40, 49.00], [8.45, 49.05]] } },
            { distance: 300, ref: "", name: "Hauptstraße", geometry: { coordinates: [[8.45, 49.05], [8.452, 49.052]] } },
            { distance: 5000, ref: "B 3;B 10", name: "", geometry: { coordinates: [[8.452, 49.052], [8.50, 49.10]] } },
            { distance: 0, ref: "", name: "", geometry: { coordinates: [[8.50, 49.10]] } },
          ],
        },
      ],
    },
  ],
}

const fakeFetch = (payload) => vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }))

describe("osrm.roadSegments", () => {
  it("zerlegt die Route in geordnete Abschnitte mit Ref, km-Bereich und Mittelpunkt", async () => {
    const osrm = createOsrm({ baseUrl: "http://osrm:5000", fetchImpl: fakeFetch(OSRM_STEPS) })
    const segs = await osrm.roadSegments([{ lat: 49.0, lng: 8.4 }, { lat: 49.1, lng: 8.5 }])

    expect(segs).toHaveLength(4)

    // A5: Ref normalisiert, km kumuliert ab 0
    expect(segs[0]).toMatchObject({ ref: "A5", refs: ["A5"], vonKm: 0, laengeKm: 12 })
    expect(segs[0].bisKm).toBeCloseTo(12)
    expect(segs[0].mitte).toEqual({ lat: 49.05, lng: 8.45 }) // mittlerer Stützpunkt (Index 1)

    // No-Ref-Abschnitt: ref null, Name erhalten, osmKlasse noch null
    expect(segs[1]).toMatchObject({ ref: null, refs: [], name: "Hauptstraße", osmKlasse: null })
    expect(segs[1].vonKm).toBeCloseTo(12)
    expect(segs[1].bisKm).toBeCloseTo(12.3)

    // Mehrfach-Ref: erster als ref, alle in refs
    expect(segs[2].ref).toBe("B3")
    expect(segs[2].refs).toEqual(["B3", "B10"])
  })

  it("liefert null ohne verwertbare Steps", async () => {
    const osrm = createOsrm({ baseUrl: "http://osrm:5000", fetchImpl: fakeFetch({ code: "NoRoute" }) })
    expect(await osrm.roadSegments([{ lat: 49, lng: 8 }, { lat: 49.1, lng: 8.1 }])).toBeNull()
  })
})

describe("ergaenzeOrtsklassen", () => {
  it("klassifiziert nur No-Ref-Abschnitte, respektiert Cap und dedupliziert", async () => {
    const reverseRoadClass = vi.fn(async () => "residential")
    const nominatim = { reverseRoadClass }
    const mitte = { lat: 49.05, lng: 8.45 }
    const segmente = [
      { ref: "A5", refs: ["A5"], laengeKm: 12, mitte: { lat: 49.0, lng: 8.4 }, osmKlasse: null }, // hat Ref → skip
      { ref: null, refs: [], laengeKm: 0.3, mitte, osmKlasse: null }, // enrich
      { ref: null, refs: [], laengeKm: 0.01, mitte: { lat: 49.2, lng: 8.6 }, osmKlasse: null }, // zu kurz → skip
      { ref: null, refs: [], laengeKm: 0.4, mitte, osmKlasse: null }, // gleicher Mittelpunkt → dedupe (kein 2. Call)
    ]

    await ergaenzeOrtsklassen(segmente, nominatim)

    expect(segmente[0].osmKlasse).toBeNull()
    expect(segmente[1].osmKlasse).toBe("residential")
    expect(segmente[2].osmKlasse).toBeNull()
    expect(segmente[3].osmKlasse).toBe("residential") // aus Cache
    expect(reverseRoadClass).toHaveBeenCalledTimes(1) // dedupe: nur ein echter Call
  })

  it("deckelt die Anzahl der Reverse-Calls", async () => {
    const reverseRoadClass = vi.fn(async () => "residential")
    const segmente = Array.from({ length: 20 }, (_, i) => ({
      ref: null, refs: [], laengeKm: 0.3, mitte: { lat: 49 + i * 0.01, lng: 8 + i * 0.01 }, osmKlasse: null,
    }))
    await ergaenzeOrtsklassen(segmente, { reverseRoadClass }, { maxAufrufe: 5 })
    expect(reverseRoadClass).toHaveBeenCalledTimes(5)
  })

  it("ist ein No-op ohne reverseRoadClass-fähigen Nominatim", async () => {
    const segmente = [{ ref: null, refs: [], laengeKm: 0.3, mitte: { lat: 49, lng: 8 }, osmKlasse: null }]
    await ergaenzeOrtsklassen(segmente, null)
    expect(segmente[0].osmKlasse).toBeNull()
  })
})
