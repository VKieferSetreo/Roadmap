import { describe, expect, it } from "vitest"
import { istReineInfrastruktur } from "../src/obstaclesRepo.js"

describe("istReineInfrastruktur — reine Infrastruktur ohne Abweichung raus, Abweichungen bleiben", () => {
  it("reine Bauwerke (Brücke/Tunnel/sonstige) ohne Restriktion → true (raus)", () => {
    expect(istReineInfrastruktur({ kategorie: "bruecke", attrs: {} })).toBe(true)
    expect(istReineInfrastruktur({ kategorie: "tunnel", attrs: {} })).toBe(true)
    expect(istReineInfrastruktur({ kategorie: "sonstige", attrs: {} })).toBe(true)
  })

  it("GST-Positiv-Routennetz (gstRoute) ohne Restriktion → true (raus)", () => {
    expect(istReineInfrastruktur({ kategorie: "sperrung", attrs: { gstRoute: true } })).toBe(true)
  })

  it("Bauwerk MIT Abweichung (Limit/Sperre/Last) → false (bleibt)", () => {
    expect(istReineInfrastruktur({ kategorie: "bruecke", attrs: { maxHoeheM: 3.5 } })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "bruecke", attrs: { grundsaetzlicheGstSperre: true } })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "bruecke", attrs: { bezugsgewichtT: 48 } })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "tunnel", attrs: { maxBreiteM: 4 } })).toBe(false)
  })

  it("Events + Restriktions-Kategorien → false (bleibt)", () => {
    expect(istReineInfrastruktur({ kategorie: "baustelle", attrs: {} })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "sperrung", attrs: { vollsperrung: true } })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "gewicht", attrs: {} })).toBe(false)
    expect(istReineInfrastruktur({ kategorie: "engstelle", attrs: {} })).toBe(false)
  })

  it("0-Werte zählen NICHT als Restriktion (defensiv)", () => {
    expect(istReineInfrastruktur({ kategorie: "bruecke", attrs: { maxHoeheM: 0 } })).toBe(true)
  })
})
