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

// T-700. Der teuerste Fehler, den das Audit vom 06.09.2026 gefunden hat: der Vorfilter sah nur
// den ANKERPUNKT eines Hindernisses. Bei einer Linie ist das der Anfangs- oder Mittelpunkt, und
// die Linie laeuft von dort aus weiter — gemessen bei 13,3 Prozent aller Linien ueber einen
// Kilometer, im Extremfall 43 km. Ergebnis: 172 Hindernisse in 42 von 67 Projekten lagen im
// 20-m-Korridor und wurden nie geladen, 17 davon mit sicherer Restbreiten-Verletzung.
//
// Der Fall hier ist "20280_DO-Unna" im Kleinen: Anker weit noerdlich der Route, Linie laeuft
// mitten hindurch. Vor dem Fix kam null zurueck.
describe("Vorfilter sieht die Geometrie, nicht nur den Ankerpunkt (T-700)", () => {
  const laden = async (obstacle) => {
    const { analyze } = await import("../src/engine/index.js")
    const db = {
      query: async (text) => (text.includes("FROM obstacles") ? { rows: [obstacle] } : { rows: [] }),
    }
    // Route laeuft auf Laengengrad 9,5 von 50,40 nach 50,59.
    const punkte = Array.from({ length: 20 }, (_, i) => ({ lat: 50.4 + i * 0.01, lng: 9.5 }))
    return analyze({
      db,
      project: { id: null, routes: [{ id: "r1", name: "Test", points: punkte, source: "startziel" }], transport: TRANSPORT },
      corridorM: 500,
    })
  }
  const basis = {
    id: "o2", kategorie: "baustelle", name: "Engstelle weit weg verankert", beschreibung: null,
    strassen_ref: null, zustaendig: null, quelle: "0001",
    attrs: { restbreiteM: 3.0 }, gueltig_von: null, gueltig_bis: null,
  }

  it("findet die Baustelle, deren Anker 20 km neben der Route liegt", async () => {
    const out = await laden({
      ...basis,
      lat: 50.8, lng: 9.5, // Anker deutlich noerdlich des Streckenendes bei 50,59
      // Von der Route weg nach Norden, also IN Reiserichtung digitalisiert. Die Richtung gehoert
      // hier dazu: der Gegenfahrbahn-Filter (T-635) verwirft eine Linie, die im Korridor
      // ueberwiegend gegen die Fahrtrichtung laeuft, und das taete er auch unabhaengig von der
      // Bbox-Frage. Der naechste Test haelt genau das fest.
      geom: { type: "LineString", coordinates: [[9.5, 50.5], [9.5, 50.7], [9.5, 50.8]] },
    })
    expect(out.findings.some((f) => f.titel?.includes("Engstelle"))).toBe(true)
  })

  // Beim Schreiben des Tests darueber zuerst falsch herum digitalisiert — und prompt kam null
  // zurueck. Das ist kein Fehler, sondern der Gegenfahrbahn-Filter bei der Arbeit. Er steht hier,
  // damit der naechste, der den Bbox-Filter anfasst, die beiden nicht verwechselt.
  it("laesst den Gegenfahrbahn-Filter unberuehrt", async () => {
    const out = await laden({
      ...basis,
      lat: 50.8, lng: 9.5,
      geom: { type: "LineString", coordinates: [[9.5, 50.8], [9.5, 50.7], [9.5, 50.5]] },
    })
    expect(out.findings.some((f) => f.titel?.includes("Engstelle"))).toBe(false)
  })

  it("holt aber nichts herein, was auch mit seiner Geometrie danebenliegt", async () => {
    const out = await laden({
      ...basis,
      lat: 50.8, lng: 9.5,
      geom: { type: "LineString", coordinates: [[9.5, 50.8], [9.5, 50.75], [9.5, 50.7]] }, // bleibt oben
    })
    expect(out.findings.some((f) => f.titel?.includes("Engstelle"))).toBe(false)
  })

  it("behandelt ein Punkt-Hindernis ohne Geometrie unveraendert", async () => {
    const drauf = await laden({ ...basis, lat: 50.5, lng: 9.5, geom: null })
    expect(drauf.findings.some((f) => f.titel?.includes("Engstelle"))).toBe(true)
    const daneben = await laden({ ...basis, lat: 50.8, lng: 9.5, geom: null })
    expect(daneben.findings.some((f) => f.titel?.includes("Engstelle"))).toBe(false)
  })
})

// Echte Attribut-Formen aus der Produktion. Beim ersten Anlauf pruefte die Einordnung
// nur maxBreiteM — die Daten fuehren aber restbreiteM. Eine Baustelle mit 3,25 m
// Restbreite galt damit fuer einen 4,0-m-Transport als "mit Auflagen fahrbar".
describe("echte Baustellen-Attribute", () => {
  const vierMeter = { hoehe: 4.3, breite: 4.0, gesamtgewicht: 220 }

  it("Restbreite unter Transportbreite ist kein Auflagenfall", () => {
    const l = bewerteAuflagen({ kategorie: "baustelle", attrs: { spurenFrei: 1, restbreiteM: 3.25, sperrlaengeM: 700 }, transport: vierMeter })
    expect(l.fahrbarkeit).toBe("einzelfallpruefung")
    expect(l.vorlauf).toBe(true)
    expect(l.begruendung).toMatch(/Restbreite/)
  })

  it("breite Baustelle bleibt ein Auflagenfall", () => {
    const l = bewerteAuflagen({ kategorie: "baustelle", attrs: { spurenFrei: 5, restbreiteM: 11.25 }, transport: vierMeter })
    expect(l.fahrbarkeit).toBe("mit-auflagen")
  })

  it("knappe Restbreite verlangt Begleitung", () => {
    const l = bewerteAuflagen({ kategorie: "baustelle", attrs: { restbreiteM: 4.3 }, transport: vierMeter })
    expect(l.fahrbarkeit).toBe("mit-auflagen")
    expect(l.auflagen).toContain("Begleitfahrzeug BF3")
  })

  it("Bauwerk mit grundsaetzlicher GST-Sperre braucht ein Verfahren", () => {
    const l = bewerteAuflagen({ kategorie: "bruecke", attrs: { grundsaetzlicheGstSperre: true }, transport: vierMeter })
    expect(l.fahrbarkeit).toBe("einzelfallpruefung")
  })
})
