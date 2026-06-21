import { describe, it, expect } from "vitest"
import {
  dedupeObstacles, dupExterneId, extractStammdaten, makeNormalized, stripHtml, tonnageAusText,
} from "../src/connectors/_helpers.js"
import { enrichFromText } from "../src/enrich.js"

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

  it("T-254: Clearance-Begriffe als maxHoeheM, Fahrzeug-Höhen NICHT", () => {
    expect(extractStammdaten("lichte Höhe 4.0 m").maxHoeheM).toBe(4.0)
    expect(extractStammdaten("Höhenbeschränkung 3,5 m").maxHoeheM).toBe(3.5)
    expect(extractStammdaten("Höhe: 3,8 m").maxHoeheM).toBe(3.8)
    // Fahrzeug-/Transport-Maße dürfen NICHT als Durchfahrtshöhe gelesen werden (falsches Limit).
    expect(extractStammdaten("Aufbauhöhe 4,0 m").maxHoeheM).toBeUndefined()
    expect(extractStammdaten("Transporthöhe 4,2 m").maxHoeheM).toBeUndefined()
    expect(extractStammdaten("Gesamthöhe 4,5 m").maxHoeheM).toBeUndefined()
    expect(extractStammdaten("Ladehöhe 3,9 m").maxHoeheM).toBeUndefined()
  })

  it("leerer/fehlender Text → {}", () => {
    expect(extractStammdaten(null)).toEqual({})
    expect(extractStammdaten("")).toEqual({})
    expect(extractStammdaten("Reinigungsarbeiten ohne Angaben")).toEqual({})
  })

  it("Achslast, Straßen-Ref und Richtung (Pfeil-Korridor)", () => {
    const ex = extractStammdaten("A7: Hamburg → Kassel, zul. Achslast 11,5 t")
    expect(ex.maxAchslastT).toBe(11.5)
    expect(ex.strassenRef).toBe("A7")
    expect(ex.richtung).toBe("Hamburg → Kassel")
  })

  it("Einzeldatum OHNE Gültigkeits-Kontext wird NICHT übernommen (z.B. 'Stand')", () => {
    expect(extractStammdaten("Stand 15.03.2024").gueltigVon).toBeUndefined()
    expect(extractStammdaten("gültig ab 15.03.2024").gueltigVon).toBe("2024-03-15")
  })

  it("GST-Signale: Fahrbahn verengt, Fahrstreifen-Anzahl, Umleitung (mit keine-Guard), Einbahn/Sackgasse", () => {
    expect(extractStammdaten("Fahrbahn wird verengt").fahrbahnVerengt).toBe(true)
    expect(extractStammdaten("auf zwei Fahrstreifen verengt").anzahlFahrstreifen).toBe(2)
    expect(extractStammdaten("Umleitung über die B5 eingerichtet").umleitung).toBe(true)
    expect(extractStammdaten("keine Umleitung erforderlich").umleitung).toBeUndefined() // Negative-Lookbehind
    expect(extractStammdaten("Einbahnstraße aufgehoben").einbahnstrasse).toBe(true)
    expect(extractStammdaten("Litzelaustraße wird zur Sackgasse").sackgasse).toBe(true)
    expect(extractStammdaten("Notmaßnahme Wasserrohrbruch").havarie).toBe(true)
    expect(extractStammdaten("Arbeiten an der Fernwärme-Leitung").medium).toMatch(/Fernw/)
  })

  it("Sperrart (Voll vor Halb) + Richtung aus echtem Baustellen-Text", () => {
    const a = extractStammdaten("Die Straße ist in Fahrtrichtung stadtauswärts eingeengt.")
    expect(a.richtung).toBe("stadtauswärts")
    const b = extractStammdaten("halbseitige Sperrung: Verkehrsregelung durch Verkehrszeichen")
    expect(b.halbseitig).toBe(true)
    expect(b.vollsperrung).toBeUndefined()
    expect(extractStammdaten("Vollsperrung der Fahrbahn").vollsperrung).toBe(true)
    expect(extractStammdaten("in beide Fahrtrichtungen wechselseitig eingeengt").richtung).toBe("beide Richtungen")
  })
})

describe("enrichFromText (Bestands-Anreicherung)", () => {
  it("füllt Lücken, lässt vorhandene Werte unangetastet", () => {
    const p = enrichFromText({
      name: "A7 Baustelle", beschreibung: "Durchfahrtsbreite 3,5 m, gültig ab 01.07.2026",
      attrs: { maxGewichtT: 40 }, gueltigVon: null, gueltigBis: null, strassenRef: null, richtung: null,
    })
    expect(p.changed).toBe(true)
    expect(p.attrs.maxGewichtT).toBe(40) // bleibt
    expect(p.attrs.restbreiteM).toBe(3.5) // neu
    expect(p.gueltigVon).toBe("2026-07-01")
    expect(p.strassenRef).toBe("A7")
  })

  it("nichts zu holen → changed=false", () => {
    const p = enrichFromText({ name: "Objekt 12", beschreibung: "OSM highway=residential", attrs: { maxHoeheM: 3.8 } })
    expect(p.changed).toBe(false)
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
    // Beschreibung bleibt PURER Quelltext (keine eigene Notiz); Ableitung markiert kiAufbereitet.
    expect(o.beschreibung).toBe("Maximale Durchfahrtsbreite: 10.75 m, gültig ab 15.06.26")
    expect(o.kiAufbereitet).toBe(true)
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
      externeId: "x3", kategorie: "bruecke", name: "Objekt 12",
      beschreibung: "OSM highway=residential", lat: 53.5, lng: 9.9, quelleName: "Test",
    })
    expect(o.beschreibung).toBe("OSM highway=residential")
    expect(o.attrs).toEqual({})
  })

  it("Sanitizing: 0-Sentinel-Maße raus, HTML gestrippt", () => {
    const o = makeNormalized({
      externeId: "x4", kategorie: "baustelle", name: "Test",
      beschreibung: 'Hinweis <a href="https://x.de">Link</a> &amp; mehr',
      lat: 53.5, lng: 9.9, attrs: { restbreiteM: 0, maxGewichtT: 7.5 }, quelleName: "Test",
    })
    expect(o.attrs.restbreiteM).toBeUndefined() // 0 gedroppt
    expect(o.attrs.maxGewichtT).toBe(7.5) // echter Wert bleibt
    expect(o.beschreibung).toBe("Hinweis Link & mehr")
  })
})

describe("dedupeObstacles (genereller Dublettenfilter)", () => {
  const seg = (ext, lat, lng, geom, extra = {}) => ({
    externeId: ext, kategorie: "sperrung", name: "L536 Tunnelwartung",
    lat, lng, geom, attrs: {}, ...extra,
  })

  it("fasst gleiche Kategorie+Name+~Ort (3 NK) zu EINER Strecke mit MultiLineString zusammen", () => {
    const items = [
      seg("x-.001", 48.1230, 9.5001, { type: "LineString", coordinates: [[9.50, 48.12], [9.51, 48.13]] }, { gueltigBis: "2026-07-10" }),
      seg("x-.002", 48.1234, 9.5004, { type: "LineString", coordinates: [[9.51, 48.13], [9.52, 48.14]] }, { gueltigBis: "2026-07-20" }),
      seg("x-.003", 48.1231, 9.5002, null, { gueltigVon: "2026-07-01" }),
    ]
    const out = dedupeObstacles(items)
    expect(out).toHaveLength(1)
    expect(out[0].geom.type).toBe("MultiLineString")
    expect(out[0].geom.coordinates).toHaveLength(2) // beide LineStrings, null ignoriert
    expect(out[0].externeId).toBe(dupExterneId(items[0])) // stabil
    expect(out[0].gueltigVon).toBe("2026-07-01") // frühestes Von
    expect(out[0].gueltigBis).toBe("2026-07-20") // spätestes Bis
  })

  it("schärfste Maße gewinnen beim Zusammenfassen", () => {
    const out = dedupeObstacles([
      seg("a", 48.12, 9.50, null, { attrs: { restbreiteM: 3.5, spurenGesperrt: 1 } }),
      seg("b", 48.12, 9.50, null, { attrs: { restbreiteM: 3.0, spurenGesperrt: 2 } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attrs.restbreiteM).toBe(3.0) // Minimum (engste Stelle)
    expect(out[0].attrs.spurenGesperrt).toBe(2) // Maximum
  })

  it("verschiedene Namen / weit entfernte Orte bleiben getrennt; Einträge ohne Namen unangetastet", () => {
    const out = dedupeObstacles([
      seg("a", 48.12, 9.50, null),
      { ...seg("b", 48.12, 9.50, null), name: "B29 Tunnelwartung" }, // anderer Name
      { ...seg("c", 48.99, 9.99, null) }, // weit weg (anderer Ort-Key)
      { externeId: "n1", kategorie: "baustelle", name: "", lat: 48.12, lng: 9.50, attrs: {} }, // ohne Namen
    ])
    expect(out).toHaveLength(4) // nichts zusammengefasst
  })
})

describe("stripHtml", () => {
  it("entfernt Tags, dekodiert Entities, behält Zeilenumbrüche", () => {
    expect(stripHtml('A <b>x</b> &amp; <a href="u">y</a>')).toBe("A x & y")
    expect(stripHtml("Zeile1\nZeile2")).toBe("Zeile1\nZeile2")
    expect(stripHtml(null)).toBe(null)
    expect(stripHtml("   ")).toBe(null)
  })
})

describe("tonnageAusText — Gewichts-Limit-Kontext (T-253)", () => {
  it("incidentelle Tonnage OHNE Limit-Kontext → null (kein falsches Fahrzeuglimit)", () => {
    expect(tonnageAusText("40t-Kran im Einsatz")).toBeNull()
    expect(tonnageAusText("Abtrag von 25t Asphalt")).toBeNull()
  })
  it("mit Gewichts-Limit-Kontext → extrahiert das Limit", () => {
    expect(tonnageAusText("zul. Gesamtgewicht 7,5 t")).toBe(7.5)
    expect(tonnageAusText("Tragfähigkeit 16 t")).toBe(16)
    expect(tonnageAusText("Gewichtsbeschränkung 3,5 t")).toBe(3.5)
    expect(tonnageAusText("gesperrt für Fahrzeuge über 7,5 t")).toBe(7.5)
  })
  it("Adjazenz: Kran-Tonnage davor verfälscht das Limit nicht", () => {
    expect(tonnageAusText("Einsatz 40t-Kran, Brücke Tragfähigkeit 16 t")).toBe(16)
  })
  it("requireKontext:false (dediziertes Feld) nimmt die rohe Zahl", () => {
    expect(tonnageAusText("16 t", { requireKontext: false })).toBe(16)
    expect(tonnageAusText("..., max 16 to", { requireKontext: false })).toBe(16)
  })
})
