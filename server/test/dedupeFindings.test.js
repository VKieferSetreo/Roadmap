// Funde-Dedup: NUR ko-lokalisierte Punkt-Dubletten zusammenfassen; Strecken/Fahrtrichtungen bleiben.

import { describe, expect, it } from "vitest"
import { dedupeFindings } from "../src/engine/index.js"

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
