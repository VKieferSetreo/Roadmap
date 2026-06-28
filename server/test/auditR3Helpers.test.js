// T-611 (Audit R3): geteilte Helfer-Fixes — Entity-Decode, strassenRefAus (Suffix/ausgeschrieben),
// richtungAus (Wortanker), humanizeTitel (Uf/ÜF, Ab/St-Codes, A#/A#-NearDup, //-Mehrsegment).
import { describe, it, expect } from "vitest"
import { decodeEntities, cleanText } from "../src/util.js"
import { extractStammdaten, stripHtml } from "../src/connectors/_helpers.js"
import { humanizeTitel } from "../src/engine/index.js"
import { evaluate } from "../src/engine/rules.js"
import { normalizeAutobahn } from "../src/connectors/autobahn.js"

const TR = { laenge: 24.5, breite: 3.0, hoehe: 4.2, gesamtgewicht: 68, achsen: 8 }
const ob = (kategorie, attrs) => ({ kategorie, attrs, gueltigVon: null, gueltigBis: null })
const aItem = (title) => ({
  identifier: "id1", title, subtitle: "Nord", coordinate: { lat: "51.6", long: "7.8" },
  description: [], geometry: { type: "LineString", coordinates: [[7.8, 51.6], [7.81, 51.61]] },
})

describe("decodeEntities / cleanText / stripHtml", () => {
  it("deutsche Umlaut-/ß-Entities", () => {
    expect(decodeEntities("Ma&szlig;nahme Fernw&auml;rme M&auml;rzgasse &Ouml;rtlich")).toBe("Maßnahme Fernwärme Märzgasse Örtlich")
  })
  it("numerische Entities + Steuerzeichen", () => {
    expect(decodeEntities("Station 1545&#13;")).toBe("Station 1545")
    expect(decodeEntities("a&#x40;b")).toBe("a@b")
  })
  it("stripHtml dekodiert Umlaut-Entities", () => {
    expect(stripHtml("Montpellierbr&uuml;cke")).toBe("Montpellierbrücke")
  })
  it("cleanText lässt reinen Text unberührt, dekodiert aber Entities", () => {
    expect(cleanText("B 73")).toBe("B 73")
    expect(cleanText("Ma&szlig;nahme")).toBe("Maßnahme")
  })
})

describe("strassenRefAus via extractStammdaten", () => {
  it("Buchstabensuffix B96A", () => {
    expect(extractStammdaten("B96A Berlin, Petersburger Straße").strassenRef).toBe("B96A")
  })
  it("ausgeschriebene Form Autobahn/Bundesstraße", () => {
    expect(extractStammdaten("Im Autobahnkreuz ist die Überfahrt von der Autobahn 3 gesperrt").strassenRef).toBe("A3")
    expect(extractStammdaten("Bundesstraße 55a, Rampe gesperrt").strassenRef).toBe("B55a")
  })
  it("normales Kürzel bleibt", () => {
    expect(extractStammdaten("B252 Ortsdurchfahrt").strassenRef).toBe("B252")
  })
})

describe("richtungAus via extractStammdaten (Wortanker)", () => {
  it("'Einrichtung …' liefert KEINE Richtung mehr", () => {
    expect(extractStammdaten("Einrichtung eines Notgehweges").richtung).toBeUndefined()
    expect(extractStammdaten("Einrichtung einer Umleitung für den IV").richtung).toBeUndefined()
  })
  it("echte Richtungsangabe bleibt, ohne Verb-Anhang", () => {
    expect(extractStammdaten("A9 Richtung Halle, Fahrbahn verengt").richtung).toBe("Halle")
  })
})

describe("humanizeTitel (T-611 bruecke)", () => {
  it("Uf + Ab/St-Codes", () => {
    expect(humanizeTitel("Uf EVB-Strecke unter A1, Ab 265, St 5006", "bruecke")).toBe("Unterführung EVB-Strecke unter A1")
  })
  it("ÜF expandiert", () => {
    expect(humanizeTitel("ÜF B9 (Kette/Saar)", "bruecke")).toBe("Überführung B9 (Kette/Saar)")
  })
  it("Ab+St mit Tbw-Suffix raus (BASt-Realform)", () => {
    expect(humanizeTitel("Uf Aue unter A1, Ab 280, St 5806/Tbw2", "bruecke")).toBe("Unterführung Aue unter A1")
  })
  it("freistehende Staatsstraße 'St 2406' bleibt (kein BASt-Stationscode ohne 'Ab')", () => {
    expect(humanizeTitel("Brücke A6 über St 2406", "bruecke")).toBe("Brücke A6 über St 2406")
  })
  it("A#/A#-NearDup kollabiert auf erste Hälfte", () => {
    expect(humanizeTitel("A2 / Ahse/A2 / Ahsebrücke", "bruecke")).toBe("A2 / Ahse")
  })
  it("verschiedene A-Nummern werden NICHT kollabiert", () => {
    expect(humanizeTitel("A1 / Rhein/A3 / Main", "bruecke")).toBe("A1 / Rhein/A3 / Main")
  })
})

describe("humanizeTitel (T-611 baustelle //-Mehrsegment)", () => {
  it("Sperr-Meta nach /// raus, Straßenteil bleibt", () => {
    expect(humanizeTitel("Berghofer Straße 206 - Velegung Glasfaser /// Halbseitige Sperrung (wechselseitig) + LSA", "baustelle"))
      .toBe("Berghofer Straße 206 - Velegung Glasfaser")
  })
})

describe("T-611 Falsch-Kritische (Wave A)", () => {
  it("A2: Achslast (VZ263→maxAchslastT) erzeugt KEIN Falsch-Kritisch (unterdrückt wie alle Achslast-Daten)", () => {
    expect(evaluate(ob("gewicht", { maxAchslastT: 5 }), TR, {})).toBeNull()
  })
  it("A2: echtes Gewichtslimit überschritten bleibt kritisch", () => {
    const r = evaluate(ob("gewicht", { maxGewichtT: 40 }), TR, {})
    expect(r.severity).toBe("kritisch")
  })
  it("A3: Vollsperrung (Querstraße) bei halbseitiger Hauptmaßnahme → keine vollsperrung", () => {
    const ex = extractStammdaten("Berghofer Straße - Halbseitige Sperrung (wechselseitig) + Vollsperrung (Iltisweg)")
    expect(ex.vollsperrung).toBeUndefined()
    expect(ex.halbseitig).toBe(true)
  })
  it("A3: echte Vollsperrung der Hauptstraße bleibt", () => {
    expect(extractStammdaten("Vollsperrung A3 zwischen Köln und Bonn").vollsperrung).toBe(true)
  })
  it("A1: Rampen-Sperrung (Einfahrt … gesperrt) → kein vollsperrung", () => {
    const o = normalizeAutobahn(aItem("A2 - AS Hamm Uentrop - Einfahrt FR Dortmund gesperrt"), "A2", "closure", "u")
    expect(o.attrs.vollsperrung).toBeUndefined()
  })
  it("A1: Mainline-Sperrung (von X nach Y) bleibt vollsperrung", () => {
    const o = normalizeAutobahn(aItem("A5 von Rust nach Riegel Erneuerung der Fahrbahn"), "A5", "closure", "u")
    expect(o.attrs.vollsperrung).toBe(true)
  })
})
