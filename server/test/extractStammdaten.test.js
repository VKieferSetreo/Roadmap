import { describe, it, expect } from "vitest"
import { extractStammdaten, makeNormalized } from "../src/connectors/_helpers.js"

// Echter Autobahn-API-Beschreibungsblock (A7, wie im Karten-Popup gesehen).
const A7 = [
  "Hamburg → Kassel",
  "Die Baustelle ist zu folgenden Zeiträumen gültig: 15.06.26 von 07:00 bis 19:00 Uhr",
  "A7: Hamburg → Kassel, zwischen 2.2 km hinter Up n Bummelskampe und 1.9 km vor Hannover-Wülferode",
  "Länge: 24.92 km | Maximale Durchfahrtsbreite: 10.75 m",
  "A7 von Up n Bummelskampe (Parkplatz)",
  "Reinigungsarbeiten",
].join("\n")

describe("extractStammdaten", () => {
  it("zieht Breite, Länge, Zeitfenster und Startdatum aus dem A7-Block", () => {
    const ex = extractStammdaten(A7)
    expect(ex.restbreiteM).toBe(10.75)
    expect(ex.sperrlaengeM).toBe(24920) // 24.92 km → m
    expect(ex.zeitfenster).toBe("07:00–19:00")
    expect(ex.gueltigVon).toBe("2026-06-15")
    expect(ex.gueltigBis).toBeUndefined() // nur ein Datum → kein Ende
  })

  it("verwechselt Maß-/Distanzangaben (2.2 km, 10.75 m) nicht mit Daten", () => {
    const ex = extractStammdaten("zwischen 2.2 km und 1.9 km, Breite 10.75 m")
    expect(ex.gueltigVon).toBeUndefined()
    expect(ex.restbreiteM).toBe(10.75)
  })

  it("Datums-Heuristik: kleinstes = Start, größtes = Ende", () => {
    const ex = extractStammdaten("gültig vom 15.08.2026 bis 01.07.2026 sowie 20.07.2026")
    expect(ex.gueltigVon).toBe("2026-07-01")
    expect(ex.gueltigBis).toBe("2026-08-15")
  })

  it("Höhe und Gewicht mit Schlüsselwort", () => {
    const ex = extractStammdaten("Durchfahrtshöhe 3,8 m, zulässiges Gewicht 7,5 t")
    expect(ex.maxHoeheM).toBe(3.8)
    expect(ex.maxGewichtT).toBe(7.5)
  })

  it("leerer/fehlender Text → {}", () => {
    expect(extractStammdaten(null)).toEqual({})
    expect(extractStammdaten("")).toEqual({})
    expect(extractStammdaten("Reinigungsarbeiten ohne Angaben")).toEqual({})
  })
})

describe("makeNormalized — Strip-down-Integration", () => {
  it("füllt fehlende Stammdaten aus der Beschreibung + setzt Hinweis", () => {
    const o = makeNormalized({
      externeId: "x1", kategorie: "baustelle", name: "Baustelle A7",
      beschreibung: "Maximale Durchfahrtsbreite: 10.75 m, gültig ab 15.06.26",
      lat: 53.5, lng: 9.9, quelleName: "Test",
    })
    expect(o.attrs.restbreiteM).toBe(10.75)
    expect(o.gueltigVon).toBe("2026-06-15")
    expect(o.beschreibung).toContain("aus Meldungstext extrahiert")
  })

  it("überschreibt vom Connector gesetzte Werte NICHT", () => {
    const o = makeNormalized({
      externeId: "x2", kategorie: "engstelle", name: "Engstelle",
      beschreibung: "Breite laut Text 2 m",
      lat: 53.5, lng: 9.9, attrs: { restbreiteM: 3.5 }, gueltigVon: "2026-01-01", quelleName: "Test",
    })
    expect(o.attrs.restbreiteM).toBe(3.5) // Connector-Wert gewinnt
    expect(o.gueltigVon).toBe("2026-01-01")
  })

  it("kein Treffer → Beschreibung unverändert, kein Hinweis", () => {
    const o = makeNormalized({
      externeId: "x3", kategorie: "bruecke", name: "Brücke",
      beschreibung: "OSM highway=residential", lat: 53.5, lng: 9.9, quelleName: "Test",
    })
    expect(o.beschreibung).toBe("OSM highway=residential")
    expect(o.attrs).toEqual({})
  })
})
