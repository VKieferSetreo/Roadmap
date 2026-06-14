import { describe, expect, it } from "vitest"
import { istLiveVerkehrsmeldung, istReineInfrastruktur } from "../src/obstaclesRepo.js"

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

describe("istLiveVerkehrsmeldung — ephemere Live-/Ad-hoc-Meldungen raus, geplante bleiben", () => {
  it("Live-Ad-hoc (Panne/Gefahr/Witterung/Ladung) → true (raus)", () => {
    expect(istLiveVerkehrsmeldung({ name: "A5 Basel Richtung Karlsruhe", beschreibung: "Gefahr durch defekten PKW auf dem mittleren Fahrstreifen" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "A8", beschreibung: "liegengebliebenes Fahrzeug" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "B10", beschreibung: "Bergung nach Unfall" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "Ölspur auf der Fahrbahn", beschreibung: "" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "A81", beschreibung: "Falschfahrer gemeldet" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "A6", beschreibung: "witterungsbedingt Glätte" })).toBe(true)
    expect(istLiveVerkehrsmeldung({ name: "A7", beschreibung: "verlorene Ladung auf der Fahrbahn" })).toBe(true)
  })

  it("Geplante Baustellen/Sperrungen bleiben → false (KEINE False-Positives)", () => {
    expect(istLiveVerkehrsmeldung({ name: "A7 | Wolfsgrund - Bad Fallingbostel", beschreibung: "Die Baustelle ist zu folgenden Zeiträumen gültig" })).toBe(false)
    expect(istLiveVerkehrsmeldung({ name: "B10 Kriegsstraße", beschreibung: "Vollsperrung wegen Bauarbeiten" })).toBe(false)
    // "Unfall"/"Brand"/"Stau" allein dürfen NICHT greifen (kämen in echten Baustellen vor)
    expect(istLiveVerkehrsmeldung({ name: "A2 Unfallschwerpunkt-Sanierung", beschreibung: "Stau möglich" })).toBe(false)
    expect(istLiveVerkehrsmeldung({ name: "Brandenburg, B5", beschreibung: "Fahrbahnerneuerung" })).toBe(false)
    // "defekte Fahrbahndecke" (geplante Reparatur) ist KEINE Live-Meldung
    expect(istLiveVerkehrsmeldung({ name: "L1", beschreibung: "defekte Fahrbahndecke wird erneuert" })).toBe(false)
  })
})
