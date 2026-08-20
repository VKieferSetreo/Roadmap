// Aus "kritisch" wird eine Entscheidung.
//
// Der Agent leitete die Einordnung bisher aus dem Modellwissen ab ("Standard-
// Durchfahrtshoehen liegen bei 4,5-4,8 m") - das klingt fachkundig und ist unbelegt.
// Hier kommt sie aus denselben Attributen, die auch den Schweregrad bestimmen.

import { describe, it, expect } from "vitest"
import { bewerteAuflagen } from "../src/engine/auflagen.js"
import { evaluate } from "../src/engine/rules.js"

const TRANSPORT = { laenge: 45, breite: 4.5, hoehe: 4.8, gesamtgewicht: 140 }

describe("Auflagen-Lage", () => {
  it("zu niedrige Bruecke ist nicht fahrbar - dagegen hilft keine Auflage", () => {
    const r = bewerteAuflagen({ kategorie: "bruecke", attrs: { maxHoeheM: 4.2 }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("nicht-fahrbar")
    expect(r.begruendung).toMatch(/Durchfahrtshöhe/)
  })

  it("knappe Hoehe ist mit Auflagen fahrbar", () => {
    const r = bewerteAuflagen({ kategorie: "bruecke", attrs: { maxHoeheM: 4.85 }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("mit-auflagen")
    expect(r.auflagen.join(" ")).toMatch(/Höhenkontrolle/)
  })

  // Der fachliche Kern: eine ueberschrittene Traglast ist KEIN Ausschluss, sondern ein
  // Verfahren - und das entscheidet ueber den Termin, nicht ueber die Auflage.
  it("ueberschrittene Traglast heisst Einzelfallpruefung mit Vorlauf", () => {
    const r = bewerteAuflagen({ kategorie: "bruecke", attrs: { maxGewichtT: 100 }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("einzelfallpruefung")
    expect(r.vorlauf).toBe(true)
    expect(r.auflagen.join(" ")).toMatch(/Bauwerksprüfung/)
  })

  it("knappe Traglast ist mit Auflagen fahrbar, ohne Verfahren", () => {
    const r = bewerteAuflagen({ kategorie: "bruecke", attrs: { maxGewichtT: 145 }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("mit-auflagen")
    expect(r.vorlauf).toBe(false)
    expect(r.auflagen.join(" ")).toMatch(/Alleinbenutzung/)
  })

  it("zu schmale Stelle ist mit Begleitung und Gegenfahrbahn fahrbar", () => {
    const r = bewerteAuflagen({ kategorie: "engstelle", attrs: { maxBreiteM: 4.0 }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("mit-auflagen")
    expect(r.auflagen.join(" ")).toMatch(/BF3/)
  })

  it("Vollsperrung ist zu, jede andere Sperrung ist Verkehrsfuehrung", () => {
    expect(bewerteAuflagen({ kategorie: "sperrung", attrs: { vollsperrung: true }, transport: TRANSPORT }).fahrbarkeit).toBe("nicht-fahrbar")
    expect(bewerteAuflagen({ kategorie: "sperrung", attrs: {}, transport: TRANSPORT }).fahrbarkeit).toBe("mit-auflagen")
  })

  it("behoerdliche GST-Auflagenpflicht ist ein Verfahren, keine Sperre", () => {
    const r = bewerteAuflagen({ kategorie: "bruecke", attrs: { grundsaetzlicheGstSperre: true }, transport: TRANSPORT })
    expect(r.fahrbarkeit).toBe("einzelfallpruefung")
    expect(r.vorlauf).toBe(true)
  })

  it("die haerteste Einzelbewertung gewinnt", () => {
    const r = bewerteAuflagen({
      kategorie: "bruecke",
      attrs: { maxHoeheM: 4.0, maxGewichtT: 200, maxBreiteM: 6 },
      transport: TRANSPORT,
    })
    expect(r.fahrbarkeit).toBe("nicht-fahrbar")
  })
})

describe("evaluate reicht die Lage durch", () => {
  it("haengt sie an jeden relevanten Fund", () => {
    const fund = evaluate(
      { kategorie: "bruecke", name: "Talbruecke Test", attrs: { maxGewichtT: 100 } },
      TRANSPORT,
      {},
    )
    expect(fund).not.toBeNull()
    expect(fund.auflagenLage.fahrbarkeit).toBe("einzelfallpruefung")
    expect(fund.auflagenLage.vorlauf).toBe(true)
  })
})

// Die Lage muss die ganze Kette ueberstehen: evaluate -> analyze -> API -> Agent.
// Beim ersten Anlauf ging sie im Fund-Aufbau der Analyse verloren (undefined beim
// Agenten), obwohl evaluate sie lieferte.
describe("Durchreichung", () => {
  it("analyze traegt die Lage in den Fund", async () => {
    const { analyze } = await import("../src/engine/index.js")
    const db = {
      query: async (text) => {
        if (text.includes("FROM obstacles")) {
          return {
            rows: [
              {
                id: "o1", kategorie: "bruecke", name: "Talbruecke Test", beschreibung: null,
                lat: 50.5, lng: 9.5, strassen_ref: "A7", zustaendig: null, quelle: "0001",
                attrs: { maxGewichtT: 100 }, gueltig_von: null, gueltig_bis: null, geom: null,
              },
            ],
          }
        }
        return { rows: [] }
      },
    }
    const punkte = Array.from({ length: 20 }, (_, i) => ({ lat: 50.4 + i * 0.01, lng: 9.5 }))
    const out = await analyze({
      db,
      project: { id: null, routes: [{ id: "r1", name: "Test", points: punkte, source: "startziel" }], transport: TRANSPORT },
      corridorM: 500,
    })
    const fund = out.findings.find((f) => f.titel?.includes("Talbruecke"))
    expect(fund).toBeTruthy()
    expect(fund.auflagenLage?.fahrbarkeit).toBe("einzelfallpruefung")
  })
})
