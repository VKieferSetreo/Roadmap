// T-601 Überführungs-Filter: BASt-Punkt-Brücken, die eine ANDERE Straße/einen Nebenweg über/unter
// die Route-Autobahn führen, werden ausgefiltert; Brücken, die die Route-Straße SELBST tragen,
// bleiben. Entscheidung über den Namen (carried vs crossed). normRoadRef normalisiert Refs.

import { describe, expect, it } from "vitest"
import { normRoadRef } from "../src/external/osrm.js"
import { isCrossingStructure } from "../src/engine/index.js"

const refs = (...xs) => new Set(xs)
const ob = (name, extra = {}) => ({ kategorie: "bruecke", name, strassenRef: null, geom: null, ...extra })
const cross = (name, route) => isCrossingStructure(ob(name), route)

describe("normRoadRef", () => {
  it("normalisiert Straßennummern", () => {
    expect(normRoadRef("A 1")).toBe("A1")
    expect(normRoadRef("B 252")).toBe("B252")
    expect(normRoadRef("St 2580")).toBe("ST2580")
    expect(normRoadRef("Münsterstraße")).toBeNull()
  })
})

describe("isCrossingStructure — getragene vs gekreuzte Straße", () => {
  it("<andere Straße> über <Route-Autobahn> → Kreuzung (true)", () => {
    expect(cross("BW 138 - Üf K142 über A1", refs("A1"))).toBe(true)
    expect(cross("Brücke St 2040 über A6", refs("A6"))).toBe(true)
    expect(cross("Brücke FW über A3", refs("A3"))).toBe(true)
    expect(cross("BW 160 - ÜF B75 über A1", refs("A1"))).toBe(true)
  })

  it("trägt die Route-Autobahn (i.Z.d. / <A> über) → behalten (false)", () => {
    // i.Z.d. A7 = trägt die A7 → Transport fährt drauf → MUSS bleiben
    expect(cross("BW 3052 -Brücke ü.d. Wl Ortshäuser Bach i.Z.d. A 7", refs("A7"))).toBe(false)
    expect(cross("Bw 26 - Brücke ü.d. L564 i.Z.d. BAB A7", refs("A7"))).toBe(false) // BAB-Präfix
    expect(cross("Brücke im Zuge der A 10 über den Havelkanal", refs("A10"))).toBe(false)
    expect(cross("Brücke i.Z. der A5 über den Kammbach", refs("A5"))).toBe(false)
    expect(cross("A 7 über A 2", refs("A7"))).toBe(false) // A7 getragen
  })

  it("trägt eine Querstraße ÜBER die Route, obwohl die Route-Autobahn auch im Namen steht → Kreuzung", () => {
    // "ü.d. A7 i.Z.d. B243" = trägt B243 über die A7 → A7-Route fährt drunter → raus
    expect(cross("BW 3053 - Brücke ü.d. A 7 km 206, i.Z.d. B 243", refs("A7"))).toBe(true)
    expect(cross("A 7 über A 2", refs("A2"))).toBe(true) // Route A2 → A7 kreuzt
  })

  it("'A<n>; Üfg <X>' — Wasser behalten, Nebenweg/andere Straße raus", () => {
    expect(cross("A5; Ufg des Saalbaches bei Karlsdorf", refs("A5"))).toBe(false) // A5 über Wasser
    expect(cross("A5; Überführung Wirtschaftsweg \"Rittmatte\"", refs("A5"))).toBe(true)
    expect(cross("A5; Üfg der K9711", refs("A5"))).toBe(true)
  })

  it("Nebenweg-Bauwerke (Wirtschaftsweg/Forstweg/Radweg/Wildtiere) → raus", () => {
    expect(cross("UF Wirtschaftsweg", refs("A7"))).toBe(true)
    expect(cross("UF Forstweg/UF Forstweg FR Kassel", refs("A7"))).toBe(true)
    expect(cross("Überführung K 3736 mit Geh- und Radweg", refs("A5"))).toBe(true)
    expect(cross("UF Wildtiere", refs("A7"))).toBe(true)
  })

  it("trailing Straßen-Label nach 'über <Wasser>' wird NICHT als Kreuzung gewertet (false)", () => {
    // "ü.d.WL Wartangergraben km 272, A7" — A7 ist Label, gekreuzt ist Wasser → behalten
    expect(cross("BW 14 Brücke ü.d.WL Wartangergraben km 272,239, A7", refs("A7"))).toBe(false)
  })

  it("Sicherheit: ohne Route-Refs nichts filtern; Strecken-Bauwerk (geom) nie filtern", () => {
    expect(isCrossingStructure(ob("Üf K142 über A1"), null)).toBe(false)
    expect(isCrossingStructure(ob("Üf K142 über A1"), refs())).toBe(false)
    expect(isCrossingStructure(ob("Üf K142 über A1", { geom: { type: "LineString", coordinates: [] } }), refs("A1"))).toBe(false)
  })

  it("nur Brücke/Tunnel, nicht baustelle/sperrung", () => {
    expect(isCrossingStructure(ob("Üf K142 über A1", { kategorie: "baustelle" }), refs("A1"))).toBe(false)
  })

  it("Fallback strassen_ref: Name unklar + ref nicht auf Route → raus; Name trägt Route → behalten", () => {
    // Name ohne über-/i.Z.-Muster, strassen_ref K77 nicht auf Route → Kreuzung
    expect(isCrossingStructure(ob("Brückenbauwerk XY", { strassenRef: "K 77" }), refs("A7"))).toBe(true)
    // Name trägt die Route (i.Z.d. A7) — Schritt 1 schützt, irreführender ref K77 wird ignoriert
    expect(isCrossingStructure(ob("Brücke i.Z.d. A7 über den Bach", { strassenRef: "K 77" }), refs("A7"))).toBe(false)
    // strassen_ref ist die Route-Straße → behalten
    expect(isCrossingStructure(ob("Brückenbauwerk XY", { strassenRef: "A 7" }), refs("A7"))).toBe(false)
  })
})
