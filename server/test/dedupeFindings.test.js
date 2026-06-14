// Funde-Dedup: klar doppelte Funde (gleiche Route + Kategorie + Name + nahe km) → einer.

import { describe, expect, it } from "vitest"
import { dedupeFindings } from "../src/engine/index.js"

const f = (over = {}) => ({
  routeId: "r1", kategorie: "baustelle", titel: "B10 Kriegsstraße zw. A und B",
  severity: "warnung", km: 10, geom: null, ...over,
})

describe("dedupeFindings", () => {
  it("gleiche Route+Kategorie+Name + nahe km → ein Fund", () => {
    const out = dedupeFindings([f({ km: 10.0 }), f({ km: 10.4 }), f({ km: 10.8 })])
    expect(out).toHaveLength(1)
  })

  it("behält den schwersten Fund", () => {
    const out = dedupeFindings([f({ km: 10, severity: "warnung" }), f({ km: 10.2, severity: "kritisch" })])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
  })

  it("bei gleicher Severity gewinnt der mit Strecken-Geometrie", () => {
    const out = dedupeFindings([
      f({ km: 10, geom: null }),
      f({ km: 10.1, geom: { type: "LineString", coordinates: [[8, 49], [8.01, 49.01]] } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].geom).not.toBeNull()
  })

  it("gleicher Name aber WEIT auseinander (Δkm > 1) bleibt getrennt", () => {
    const out = dedupeFindings([f({ km: 10 }), f({ km: 42 })])
    expect(out).toHaveLength(2)
  })

  it("verschiedene Kategorie / verschiedene Route / verschiedener Name bleiben getrennt", () => {
    const out = dedupeFindings([
      f({ km: 10, kategorie: "baustelle" }),
      f({ km: 10, kategorie: "sperrung" }),
      f({ km: 10, routeId: "r2" }),
      f({ km: 10, titel: "Andere Straße" }),
    ])
    expect(out).toHaveLength(4)
  })

  it("Name case/whitespace-robust", () => {
    const out = dedupeFindings([f({ titel: "B10  Kriegsstraße  zw. A und B" }), f({ titel: "b10 kriegsstraße zw. a und b", km: 10.3 })])
    expect(out).toHaveLength(1)
  })
})
