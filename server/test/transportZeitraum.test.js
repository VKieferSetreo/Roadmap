// T-705: der gesetzte Transportzeitraum wurde nicht gelesen, wenn er anders hiess.
//
// `projects.zeitraum` ist freies JSONB. Gemessen am 07.09.2026 ueber alle 82 Projekte der
// Produktion gibt es genau vier Schluesselformen: 52 x {} · 20 x {von,bis} · 8 x
// {von,bis,ganztaegig} · 2 x {gueltigVon,gueltigBis}. Die Engine las nur von/bis, sah bei den
// letzten beiden Projekten undefined und wertete sie ZEITLOS aus: im Detail stand "Kein
// Transportzeitraum gesetzt", und die Zeitfilterung lief gegen den Heute-Anker (T-601) statt
// gegen den Transporttermin.
//
// Voller analyze()-Lauf gegen die Produktionsdaten, vorher/nachher: 137 → 66 und 17 → 15 Funde,
// 74 weg (11 kritisch), 1 neu, 0 Severity-Aenderungen. Alle 74 Weggefallenen beginnen erst NACH
// dem Ende des gesetzten Fensters.

import { describe, expect, it } from "vitest"
import { analyze, transportZeitraum } from "../src/engine/index.js"

const TRANSPORT = { laenge: 45, breite: 3.0, hoehe: 4.0, gesamtgewicht: 40 }
const iso = (tageAbHeute) => new Date(Date.now() + tageAbHeute * 864e5).toISOString().slice(0, 10)

describe("transportZeitraum (T-705)", () => {
  it("uebersetzt gueltigVon/gueltigBis auf von/bis", () => {
    const z = transportZeitraum({ gueltigVon: "2026-07-15", gueltigBis: "2026-07-19" })
    expect(z.von).toBe("2026-07-15")
    expect(z.bis).toBe("2026-07-19")
  })

  it("laesst {von,bis} und {} unangetastet — IDENTISCHE Referenz, damit fuer die 80 anderen Projekte strukturell nichts passieren kann", () => {
    const mitVonBis = { von: "2026-09-02T00:00", bis: "2026-09-02T23:59" }
    const leer = {}
    const ganztaegig = { von: "2026-07-01T00:00", bis: "2026-07-31T23:59", ganztaegig: true }
    expect(transportZeitraum(mitVonBis)).toBe(mitVonBis)
    expect(transportZeitraum(leer)).toBe(leer)
    expect(transportZeitraum(ganztaegig)).toBe(ganztaegig)
  })

  it("ein gesetztes von/bis schlaegt den Alias — der Alias fuellt nur Luecken", () => {
    const z = transportZeitraum({ von: "2026-01-01", gueltigVon: "2026-07-15", gueltigBis: "2026-07-19" })
    expect(z.von).toBe("2026-01-01")
    expect(z.bis).toBe("2026-07-19")
  })

  it("nimmt nur nicht-leere Strings — dateOnly() wuerde aus true/42 stillen Unsinn machen", () => {
    expect(transportZeitraum({ gueltigVon: true, gueltigBis: 42 })).toEqual({ gueltigVon: true, gueltigBis: 42 })
    expect(transportZeitraum({ gueltigVon: "  " }).von).toBeUndefined()
    expect(transportZeitraum(null)).toBeNull()
    expect(transportZeitraum(undefined)).toBeUndefined()
  })
})

// Die Uebersetzung nuetzt nichts, wenn analyze() sie nicht benutzt — genau das war der Fehler.
// Deshalb geht dieser Teil durch die ganze Kette.
describe("analyze wertet gegen den gesetzten Termin aus, nicht gegen heute (T-705)", () => {
  const laufen = async (zeitraum, obstacle) => {
    const db = {
      query: async (text) => (text.includes("FROM obstacles") ? { rows: [obstacle] } : { rows: [] }),
    }
    const punkte = Array.from({ length: 20 }, (_, i) => ({ lat: 50.4 + i * 0.01, lng: 9.5 }))
    return analyze({
      db,
      project: {
        id: null, transport: TRANSPORT, zeitraum,
        routes: [{ id: "r1", name: "Test", points: punkte, source: "startziel" }],
      },
      corridorM: 500,
    })
  }
  const basis = {
    id: "o1", kategorie: "baustelle", name: "Baustelle im Transportfenster", beschreibung: null,
    lat: 50.5, lng: 9.5, strassen_ref: null, zustaendig: null, quelle: "0001",
    attrs: {}, geom: null,
  }

  // Alle Daten relativ zu heute: der Heute-Anker (T-601) verwirft ohne gelesenen Zeitraum ALLES,
  // was heute nicht laeuft — der Test bliebe sonst von seinem Ausfuehrungsdatum abhaengig.
  it("Baustelle liegt IM Fenster → Fund, mit ehrlichem Zeitraum-Detail (vorher: vom Heute-Anker verworfen)", async () => {
    const out = await laufen(
      { gueltigVon: iso(12), gueltigBis: iso(15) },
      { ...basis, gueltig_von: iso(10), gueltig_bis: iso(20) },
    )
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0].detail.Zeitraum).toBe("Überschneidet den Transportzeitraum")
  })

  it("Baustelle endet VOR dem Fenster → kein Fund (vorher: als heute aktiv gemeldet)", async () => {
    const out = await laufen(
      { gueltigVon: iso(12), gueltigBis: iso(15) },
      { ...basis, name: "Baustelle laeuft nur heute", gueltig_von: iso(-10), gueltig_bis: iso(5) },
    )
    expect(out.findings).toHaveLength(0)
  })

  it("ohne jeden Zeitraum bleibt es beim Heute-Anker — unveraendert", async () => {
    const out = await laufen({}, { ...basis, gueltig_von: iso(-10), gueltig_bis: iso(5) })
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0].detail.Zeitraum).toBe("Kein Transportzeitraum gesetzt")
  })
})
