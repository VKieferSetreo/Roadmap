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

  it("schweigt beim erwarteten Normalstand (eine Handvoll am Tag, kaum Wiederholung)", () => {
    // Max' Erwartung, an der Archivtabelle nachgemessen: von 628 an zwei Tagen wiederholt
    // gemeldeten Hindernissen hatten 8 ein wirklich bewegtes Ende, nach Relevanzfilter 4.
    expect(pruefeTrackingGuete({
      geaendertHeute: 8, geaendertGestern: 6, wiederholtVomVortag: 0, geaendertHeuteGroessteQuelle: 3,
    })).toEqual([])
  })

  it("haette den 22.09. gemeldet — 293 von 302 aus EINER Quelle, ohne jede Wiederholung", () => {
    // Der Fall, den beide alten Schwellen durchliessen: 302 lag unter der damaligen Mengengrenze
    // von 300 (knapp), und die Wiederholungsquote lag bei 2 %, weil die Autobahn-Identifier
    // taeglich rotieren und das Rauschen jeden Tag auf andere Zeilen legen.
    const befunde = pruefeTrackingGuete({
      geaendertHeute: 302, geaendertGestern: 572, wiederholtVomVortag: 13,
      geaendertHeuteGroessteQuelle: 293,
    })
    expect(befunde.map((b) => b.art).sort()).toEqual(["einquellig", "tagesmenge"])
    expect(befunde.find((b) => b.art === "einquellig").grund).toContain("97 %")
  })

  it("meldet Einquelligkeit nicht bei kleiner Masse — 3 von 4 aus einer Quelle ist Alltag", () => {
    expect(pruefeTrackingGuete({
      geaendertHeute: 4, geaendertGestern: 4, wiederholtVomVortag: 0, geaendertHeuteGroessteQuelle: 4,
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
