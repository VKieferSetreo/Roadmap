// Selbstkontrolle der Aenderungsmetrik (T-749): erkennt sie die Lage, die am 21.09.2026
// niemandem ausser Max aufgefallen ist?

import { describe, expect, it } from "vitest"
import { pruefeTrackingGuete } from "../src/routes/veraenderungen.js"

describe("pruefeTrackingGuete", () => {
  it("meldet den echten Fall vom 21.09.: 615 von 635 wiederholen sich", () => {
    const befunde = pruefeTrackingGuete({
      geaendertHeute: 800, geaendertGestern: 635, wiederholtVomVortag: 615,
    })
    expect(befunde.map((b) => b.art).sort()).toEqual(["tagesmenge", "wiederholung"])
    expect(befunde.find((b) => b.art === "wiederholung").grund).toContain("97 %")
  })

  it("schweigt beim Stand nach dem Fix (78 Aenderungen, kaum Wiederholung)", () => {
    expect(pruefeTrackingGuete({
      geaendertHeute: 78, geaendertGestern: 74, wiederholtVomVortag: 3,
    })).toEqual([])
  })

  it("prueft die Quote nicht bei zu wenig Masse — ein Anteil aus 4 Faellen ist Zufall", () => {
    expect(pruefeTrackingGuete({
      geaendertHeute: 4, geaendertGestern: 4, wiederholtVomVortag: 4,
    })).toEqual([])
  })

  it("faengt eine Mengen-Explosion auch ohne Wiederholungsmuster (Connector-Umbau)", () => {
    const befunde = pruefeTrackingGuete({
      geaendertHeute: 5000, geaendertGestern: 60, wiederholtVomVortag: 0,
    })
    expect(befunde.map((b) => b.art)).toEqual(["tagesmenge"])
  })

  it("leerer Stand ist kein Befund", () => {
    expect(pruefeTrackingGuete({})).toEqual([])
    expect(pruefeTrackingGuete(null)).toEqual([])
  })
})
