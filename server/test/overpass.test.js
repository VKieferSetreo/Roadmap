// T-601 Überführungs-Filter: Punkt-Bauwerk auf einer Straße, die der Transport nicht befährt
// (kreuzt sie nur), wird ausgefiltert. normRoadRef normalisiert Straßennummern für den Vergleich.

import { describe, expect, it } from "vitest"
import { normRoadRef } from "../src/external/osrm.js"
import { isCrossingStructure } from "../src/engine/index.js"

const refs = (...xs) => new Set(xs)
const ob = (extra) => ({ kategorie: "bruecke", strassenRef: null, geom: null, ...extra })

describe("normRoadRef", () => {
  it("normalisiert klassifizierte Straßennummern (Leerzeichen/Nullen weg)", () => {
    expect(normRoadRef("A 1")).toBe("A1")
    expect(normRoadRef("A1")).toBe("A1")
    expect(normRoadRef("B 252")).toBe("B252")
    expect(normRoadRef("K 142")).toBe("K142")
    expect(normRoadRef("L 99")).toBe("L99")
    expect(normRoadRef("St 2580")).toBe("ST2580")
    expect(normRoadRef("A 09")).toBe("A9")
  })
  it("gibt null für Straßennamen / leere Refs (dann NICHT vergleichen)", () => {
    expect(normRoadRef("Münsterstraße")).toBeNull()
    expect(normRoadRef("")).toBeNull()
    expect(normRoadRef(null)).toBeNull()
    expect(normRoadRef("Wirtschaftsweg")).toBeNull()
  })
})

describe("isCrossingStructure (Überführungs-Filter)", () => {
  it("Punkt-Brücke auf Straße NICHT auf der Route → Überführung (true = rausfiltern)", () => {
    // 'Üf K142 über A1' (strassen_ref = getragene K142), Route fährt A1 → Transport kreuzt nur.
    expect(isCrossingStructure(ob({ strassenRef: "K 142" }), refs("A1", "A7"))).toBe(true)
    expect(isCrossingStructure(ob({ kategorie: "tunnel", strassenRef: "L 130" }), refs("A1"))).toBe(true)
  })
  it("Punkt-Brücke auf einer befahrenen Straße → behalten (false)", () => {
    // 'Brücke A8 über Schmutter' (A8s eigene Brücke), Route fährt A8 → wird befahren.
    expect(isCrossingStructure(ob({ strassenRef: "A 8" }), refs("A8", "A1"))).toBe(false)
  })
  it("ohne Route-Refs (OSRM weg) → behalten, konservativ (false)", () => {
    expect(isCrossingStructure(ob({ strassenRef: "K 142" }), null)).toBe(false)
    expect(isCrossingStructure(ob({ strassenRef: "K 142" }), refs())).toBe(false)
  })
  it("Straßenname statt -nummer → nicht vergleichbar → behalten (false)", () => {
    expect(isCrossingStructure(ob({ strassenRef: "Münsterstraße" }), refs("A1"))).toBe(false)
  })
  it("Strecken-Bauwerk (eigene Linien-Geometrie) → nie filtern (false)", () => {
    expect(isCrossingStructure(ob({ strassenRef: "K 142", geom: { type: "LineString", coordinates: [] } }), refs("A1"))).toBe(false)
  })
  it("nur Brücke/Tunnel, keine baustelle/sperrung (false)", () => {
    expect(isCrossingStructure(ob({ kategorie: "baustelle", strassenRef: "K 142" }), refs("A1"))).toBe(false)
    expect(isCrossingStructure(ob({ kategorie: "sperrung", strassenRef: "K 142" }), refs("A1"))).toBe(false)
  })
})
