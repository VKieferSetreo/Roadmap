// Funde-Dedup: NUR ko-lokalisierte Punkt-Dubletten zusammenfassen; Strecken/Fahrtrichtungen bleiben.

import { describe, expect, it } from "vitest"
import { dedupeByLocation, dedupeFindings } from "../src/engine/index.js"

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

  it("T-603: byte-identische Geometrie (Re-Import-Klon, andere obstacle_id) → gemergt", () => {
    const klon = { type: "LineString", coordinates: [[8, 49], [8.01, 49.01]] } // gleiche Koords wie LINE
    const out = dedupeFindings([
      f({ km: 10.0, geom: LINE, severity: "kritisch" }),
      f({ km: 10.05, geom: klon, severity: "kritisch" }),
    ])
    expect(out).toHaveLength(1)
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

  it("Cross-Source: gleiche Maßnahme aus zwei Quellen (versch. Titel) → nur den kritischeren behalten", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 Arbeiten an Schutzeinrichtungen 1233", severity: "hinweis", quelle: { name: "Autobahn GmbH" } }),
      f({ km: 28.35, titel: "A61 von MG-Güdderath nach MG-Wickrath", severity: "warnung", quelle: { name: "BAB AkD — Planung (Autobahn GmbH)" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("warnung")
  })

  it("Cross-Source gleich-schwer → beide bleiben (z.B. zwei Fahrtrichtungen)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 Quelle X", severity: "warnung", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "A61 Quelle Y", severity: "warnung", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(2)
  })

  it("Cross-Source: eigener Eintrag (herkunft 'eigen') wird NIE gedroppt", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 eigene Notiz", severity: "hinweis", herkunft: "eigen", quelle: { name: "Eigener Eintrag" } }),
      f({ km: 28.35, titel: "A61 Autobahn", severity: "kritisch", quelle: { name: "Autobahn GmbH" } }),
    ])
    expect(out).toHaveLength(2)
  })

  it("gleiche Quelle, versch. Titel, gleicher km → bleiben getrennt (kein Cross-Source-Drop)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "Maßnahme A", severity: "hinweis", quelle: { name: "Autobahn GmbH" } }),
      f({ km: 28.35, titel: "Maßnahme B", severity: "warnung", quelle: { name: "Autobahn GmbH" } }),
    ])
    expect(out).toHaveLength(2)
  })
})

// T-607: Standort-Dedup — Brücken-Richtungszwillinge + quell-übergreifende Orts-Dubletten.
describe("dedupeByLocation", () => {
  const b = (over = {}) => ({
    routeId: "r1", kategorie: "bruecke", titel: "Brücke", severity: "warnung",
    km: 6.94, lat: 51.6467, lng: 7.9141, geom: null, ...over,
  })

  it("FR-Zwillinge am ~selben Punkt (≤25 m) → EIN Fund", () => {
    const out = dedupeByLocation([
      b({ titel: "Ahsebrücke FR Hannover", lat: 51.64677, lng: 7.91412 }),
      b({ titel: "Ahsebrücke FR Oberhausen", lat: 51.64677, lng: 7.91411 }),
    ])
    expect(out).toHaveLength(1)
  })

  it("behält den schwereren Fund", () => {
    const out = dedupeByLocation([
      b({ km: 2.16, lat: 51.68126, lng: 7.95370, severity: "warnung" }),
      b({ km: 2.16, lat: 51.68136, lng: 7.95347, severity: "kritisch" }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
  })

  it("verschiedene Kategorie am selben Punkt bleibt getrennt (konservativ, nichts übersehen)", () => {
    const out = dedupeByLocation([
      b({ kategorie: "baustelle" }),
      b({ kategorie: "sperrung" }),
    ])
    expect(out).toHaveLength(2)
  })

  it("echte distinkte Brücken >25 m auseinander bleiben getrennt", () => {
    const out = dedupeByLocation([
      b({ lat: 51.6467, lng: 7.9141 }),
      b({ lat: 51.6478, lng: 7.9141 }), // ~120 m nördlich
    ])
    expect(out).toHaveLength(2)
  })
})

// T-607: Titel-Humanisierung — kryptische Roh-Labels lesbar machen.
import { humanizeTitel } from "../src/engine/index.js"
describe("humanizeTitel", () => {
  it("BASt-Volldup X/X → einfach", () => {
    expect(humanizeTitel('A2 / Gem-Str. "An der Windmühle"/A2 / Gem-Str. "An der Windmühle"', "bruecke"))
      .toBe('A2 / Gem-Str. "An der Windmühle"')
    expect(humanizeTitel("A1/Vogelsang/A1/Vogelsang", "bruecke")).toBe("A1/Vogelsang")
    expect(humanizeTitel("UF WW/UF WW -", "bruecke")).toBe("UF WW")
  })
  it("Brücke: Richtungs-/Teilbauwerk-Tail + FR-Suffix raus", () => {
    expect(humanizeTitel("Ahsebrücke FR Hannover", "bruecke")).toBe("Ahsebrücke")
    expect(humanizeTitel("BW 2026 - Brücke über die Harste im Zuge der A 7/Ostseite", "bruecke"))
      .toBe("BW 2026 - Brücke über die Harste im Zuge der A 7")
    expect(humanizeTitel("Del25 / A28 über Geh-und Radweg in km 119,193/RiFa Oldenburg - Brücke", "bruecke"))
      .toBe("Del25 / A28 über Geh-und Radweg in km 119,193")
  })
  it("Baustelle: AkD-/Lage-/Zeit-Codes raus", () => {
    expect(humanizeTitel("A44 - Fahrbahninstandsetzung - AkD 31550 - 1-str. R KS - 19h bis 6h - Lage-1", "baustelle"))
      .toBe("A44 - Fahrbahninstandsetzung")
    expect(humanizeTitel("A24 Fahrbahninstandsetzung AM Fahrbinde (ARV 2024-372 NOO-2024-0124) - Lage-10 - 23.06.2026", "baustelle"))
      .toBe("A24 Fahrbahninstandsetzung AM Fahrbinde")
  })
  it("saubere Titel bleiben unverändert; nie leer", () => {
    expect(humanizeTitel("Datteln-Hamm-Kanal", "bruecke")).toBe("Datteln-Hamm-Kanal")
    expect(humanizeTitel("Am Eifeltor", "bruecke")).toBe("Am Eifeltor")
    expect(humanizeTitel("Lage-1", "baustelle")).toBe("Lage-1") // Fallback statt leer
  })
})
