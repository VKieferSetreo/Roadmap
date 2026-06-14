// Funde-Dedup: NUR ko-lokalisierte Punkt-Dubletten zusammenfassen; Strecken/Fahrtrichtungen bleiben.

import { describe, expect, it } from "vitest"
import { dedupeFindings } from "../src/engine/index.js"

const LINE = { type: "LineString", coordinates: [[8, 49], [8.01, 49.01]] }
const f = (over = {}) => ({
  routeId: "r1", kategorie: "baustelle", titel: "B10 Kriegsstraße zw. A und B",
  severity: "warnung", km: 10, geom: null, ...over,
})

describe("dedupeFindings", () => {
  it("ko-lokalisierte Punkt-Dubletten (Δkm ≤ 0.15) → ein Fund", () => {
    const out = dedupeFindings([f({ km: 10.0 }), f({ km: 10.1 }), f({ km: 10.05 })])
    expect(out).toHaveLength(1)
  })

  it("behält den schwersten Fund", () => {
    const out = dedupeFindings([f({ km: 10, severity: "warnung" }), f({ km: 10.05, severity: "kritisch" })])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
  })

  it("PER FAHRTRICHTUNG: beide mit Linien-Geometrie → BEIDE bleiben (nicht rausschneiden)", () => {
    const out = dedupeFindings([
      f({ km: 10.0, geom: LINE }),
      f({ km: 10.05, geom: { type: "LineString", coordinates: [[8.001, 49], [8.011, 49.01]] } }),
    ])
    expect(out).toHaveLength(2)
  })

  it("Punkt-Dublette neben Strecke (eine ohne geom) → zusammengefasst, geom-Variante gewinnt", () => {
    const out = dedupeFindings([f({ km: 10, geom: null }), f({ km: 10.05, geom: LINE })])
    expect(out).toHaveLength(1)
    expect(out[0].geom).not.toBeNull()
  })

  it("größerer Abstand (Δkm > 0.15) bleibt getrennt", () => {
    const out = dedupeFindings([f({ km: 10 }), f({ km: 10.3 })])
    expect(out).toHaveLength(2)
  })

  it("verschiedene Kategorie / Route / Name bleiben getrennt", () => {
    const out = dedupeFindings([
      f({ km: 10, kategorie: "baustelle" }),
      f({ km: 10, kategorie: "sperrung" }),
      f({ km: 10, routeId: "r2" }),
      f({ km: 10, titel: "Andere Straße" }),
    ])
    expect(out).toHaveLength(4)
  })

  it("Name case/whitespace-robust", () => {
    const out = dedupeFindings([f({ titel: "B10  Kriegsstraße  zw. A und B" }), f({ titel: "b10 kriegsstraße zw. a und b", km: 10.1 })])
    expect(out).toHaveLength(1)
  })
})
