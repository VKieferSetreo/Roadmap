// T-601 Überführungs-Filter. Maßgeblich = die GETRAGENE Straße (BASt hoechst_sachverhalt_oben →
// attrs.getrageneStrasse): trägt das Bauwerk die Route-Straße → behalten (echte Restriktion),
// sonst Überführung → raus. Fehlt das Feld → konservative Namens-Heuristik (nur eindeutige
// Überführungen raus, sonst behalten — keine echte Gewichts-Sperre verstecken).

import { describe, expect, it } from "vitest"
import { normRoadRef } from "../src/external/osrm.js"
import { isCrossingStructure } from "../src/engine/index.js"

const refs = (...xs) => new Set(xs)
const ob = (name, extra = {}) => ({ kategorie: "bruecke", name, strassenRef: null, geom: null, ...extra })
const G = (s) => ({ attrs: { getrageneStrasse: s } })

describe("normRoadRef", () => {
  it("normalisiert Straßennummern", () => {
    expect(normRoadRef("A 1")).toBe("A1")
    expect(normRoadRef("K 142")).toBe("K142")
    expect(normRoadRef("St 2580")).toBe("ST2580")
    expect(normRoadRef("Münsterstraße")).toBeNull()
  })
})

describe("isCrossingStructure — getrageneStrasse autoritativ", () => {
  it("trägt eine ANDERE Straße über die Route (Route liegt unten) → Überführung → raus", () => {
    expect(isCrossingStructure(ob("K 47 [Kr. OH] / A 1", G("K47")), refs("A1"))).toBe(true)
    expect(isCrossingStructure(ob("Üf L815", G("L815")), refs("A28"))).toBe(true)
  })
  it("gekreuzte Straße (unten) = Route → Überführung raus, auch wenn oben ein Nebenweg ist", () => {
    // "Forstweg / A45": oben=Forstweg (kein Ref), unten=A45 → Route A45 fährt DRUNTER → raus
    expect(isCrossingStructure(ob("Forstweg \"Kalteiche\" / A45", { attrs: { gekreuzteStrasse: "A45" } }), refs("A45"))).toBe(true)
    // "UF L3071": oben=A5, unten=L3071 → Route A5 fährt DRÜBER → behalten
    expect(isCrossingStructure(ob("UF L3071", { attrs: { getrageneStrasse: "A5", gekreuzteStrasse: "L3071" } }), refs("A5"))).toBe(false)
  })

  it("trägt die Route-Straße → behalten (echte Restriktion), auch kleine Bauwerke", () => {
    // BASt-Wahrheit: "UF Lumda" trägt die A5 (A5-Deck über dem Bach) → echte A5-Sperre → behalten
    expect(isCrossingStructure(ob("UF Lumda/UF Lumda Abschnitt Grünberg Nord", G("A5")), refs("A5"))).toBe(false)
    expect(isCrossingStructure(ob("UF Wirtschaftsweg", G("A5")), refs("A5"))).toBe(false)
    expect(isCrossingStructure(ob("A 1 / Wi-Weg (BW 2.02)", G("A1")), refs("A1"))).toBe(false)
  })
})

describe("isCrossingStructure — konservativer Namens-Fallback (ohne Strukturfeld)", () => {
  it("eindeutige Überführung im Namen ('X über Route-Autobahn') → raus", () => {
    expect(isCrossingStructure(ob("BW 138 - Üf K142 über A1"), refs("A1"))).toBe(true)
    expect(isCrossingStructure(ob("Brücke St 2040 über A6"), refs("A6"))).toBe(true)
    expect(isCrossingStructure(ob("A 7 über A 2"), refs("A2"))).toBe(true) // Route A2 → A7 kreuzt
  })
  it("Name trägt die Route-Autobahn → behalten", () => {
    expect(isCrossingStructure(ob("BW 3052 -Brücke ü.d. Wl Ortshäuser Bach i.Z.d. A 7"), refs("A7"))).toBe(false)
    expect(isCrossingStructure(ob("Bw 26 - Brücke ü.d. L564 i.Z.d. BAB A7"), refs("A7"))).toBe(false) // BAB-Präfix
    expect(isCrossingStructure(ob("A 7 über A 2"), refs("A7"))).toBe(false) // A7 getragen
  })
  it("unklare Bauwerke ohne 'über Route' → BEHALTEN (keine echte Sperre verstecken)", () => {
    expect(isCrossingStructure(ob("UF Wirtschaftsweg"), refs("A5"))).toBe(false)
    expect(isCrossingStructure(ob("UF Lumda"), refs("A5"))).toBe(false)
    expect(isCrossingStructure(ob("Talbrücke Haseltal"), refs("A3"))).toBe(false)
  })
})

describe("isCrossingStructure — Schutzregeln", () => {
  it("ohne Route-Refs nichts filtern; Strecken-Bauwerk (geom) nie filtern; nur Brücke/Tunnel", () => {
    expect(isCrossingStructure(ob("Üf K142 über A1", G("K47")), null)).toBe(false)
    expect(isCrossingStructure(ob("Üf K142 über A1", G("K47")), refs())).toBe(false)
    expect(isCrossingStructure(ob("Üf K142 über A1", { ...G("K47"), geom: { type: "LineString", coordinates: [] } }), refs("A1"))).toBe(false)
    expect(isCrossingStructure(ob("Üf K142 über A1", { ...G("K47"), kategorie: "baustelle" }), refs("A1"))).toBe(false)
  })
})
