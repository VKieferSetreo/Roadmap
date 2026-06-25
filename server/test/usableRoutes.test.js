import { describe, it, expect } from "vitest"
import { usableRoutes } from "../src/engine/index.js"

const route = (o) => ({ points: [{ lat: 53, lng: 8 }, { lat: 54, lng: 9 }], ...o })

describe("usableRoutes (Prüfen-Gate T-593)", () => {
  it("ungeprüfte VEMAGS-Strecken werden NICHT ausgewertet, freigegebene + andere Quellen schon", () => {
    const ids = usableRoutes([
      route({ id: "datei", source: "datei" }),
      route({ id: "vemags-frei", source: "vemags", verifiziert: true }),
      route({ id: "vemags-false", source: "vemags", verifiziert: false }),
      route({ id: "vemags-undef", source: "vemags" }),
    ]).map((r) => r.id)
    expect(ids).toEqual(["datei", "vemags-frei"])
  })

  it("zu wenige Punkte → raus", () => {
    expect(usableRoutes([route({ id: "x", points: [{ lat: 53, lng: 8 }] })])).toHaveLength(0)
  })
})
