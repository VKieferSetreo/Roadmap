// Funde-Dedup: NUR ko-lokalisierte Punkt-Dubletten zusammenfassen; Strecken/Fahrtrichtungen bleiben.

import { describe, expect, it } from "vitest"
import { dedupeByLocation, dedupeByObstacle, dedupeFindings } from "../src/engine/index.js"

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

  // T-709: der Widerspruch, den ein Disponent nicht aufloesen kann. "A5 | Appenweier - Achern"
  // stand in 14 Projekten ZWEIMAL am selben Meter: kritisch mit 4,00 m Restbreite und Warnung mit
  // 14,00 m. Es sind keine zwei Richtungsfahrbahnen (beide Quellzeilen tragen richtung="beide",
  // denselben Anker und denselben Abschnittstext), sondern Tageszeit-Phasen derselben Baustelle —
  // und die 14-m-Zeile fuehrt DIESELBE Linie dreimal, eine je Gueltigkeitsfenster der Quelle.
  // Der Byte-Vergleich sah darin zwei verschiedene Strecken und liess beide Funde stehen.
  it("T-709: dieselbe Linie mehrfach im MultiLineString ist DIESELBE Strecke → gemergt, strenger gewinnt", () => {
    const einfach = { type: "MultiLineString", coordinates: [[[8, 49], [8.01, 49.01]]] }
    const dreifach = {
      type: "MultiLineString",
      coordinates: [[[8, 49], [8.01, 49.01]], [[8, 49], [8.01, 49.01]], [[8, 49], [8.01, 49.01]]],
    }
    const out = dedupeFindings([
      f({ km: 10.0, geom: dreifach, severity: "warnung", restbreiteM: 14, quelle: { name: "Autobahn GmbH · A5" } }),
      f({ km: 10.0, geom: einfach, severity: "kritisch", restbreiteM: 4, quelle: { name: "Autobahn GmbH · A5" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
    expect(out[0].restbreiteM).toBe(4)
    // Die weggefaltete Phase bleibt lesbar — sonst waere die 14-m-Angabe still verschwunden.
    expect(out[0].detail["Auch gemeldet"]).toContain("Restbreite 14,00 m")
  })

  // Die Gegenprobe zur Regel darueber: der Clip macht aus einem einteiligen MultiLineString einen
  // LineString. Beide beschreiben dieselbe Strecke und muessen als gleich gelten.
  it("T-709: LineString und einteiliger MultiLineString mit denselben Koordinaten sind dieselbe Strecke", () => {
    const out = dedupeFindings([
      f({ km: 10.0, geom: LINE, severity: "warnung" }),
      f({ km: 10.0, geom: { type: "MultiLineString", coordinates: [LINE.coordinates] }, severity: "kritisch" }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
  })

  // Und die teure Richtung: zwei ECHT verschiedene Linien (die Fahrbahnen einer Autobahn) duerfen
  // von der Lockerung nicht erfasst werden. Sie unterscheiden sich in den Koordinaten, nicht nur
  // in der Zerlegung — die Mengen sind also verschieden und der Merge unterbleibt wie bisher.
  it("T-709: zwei verschiedene Linien bleiben getrennt, auch als MultiLineString", () => {
    const out = dedupeFindings([
      f({ km: 10.0, geom: { type: "MultiLineString", coordinates: [[[8, 49], [8.01, 49.01]]] } }),
      f({ km: 10.05, geom: { type: "MultiLineString", coordinates: [[[8.001, 49], [8.011, 49.01]]] } }),
    ])
    expect(out).toHaveLength(2)
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

  // T-708 (07.09.2026) kehrt diese Erwartung um — ABER NUR BEI NACHWEISLICH GLEICHER STRASSE.
  //
  // Der erste Anlauf faltete bei Severity-Gleichstand ohne diese Bedingung und war damit falsch.
  // Die Messung, die ihn trug, war auf einen 30-m-Vorfilter konditioniert, den die Regel gar
  // nicht hat (sie greift bis Δkm 0,15). Auf ihrem echten Schluessel sind es 362 gleich-schwere
  // Paare, und 8 davon tragen ZWEI VERSCHIEDENE STRASSEN — genau die Aeste eines Kreuzes, die
  // Max' Vorsatz vom 19.06.2026 schuetzen sollte. Gemessen an den 3.684 persistierten Funden
  // fielen dadurch 325 statt 9 Funde weg, darunter "A1 | Moseltal - Rioler Wald", geschluckt von
  // einem A602-Fund in 777 m Entfernung.
  //
  // Mit der Strassen-Bedingung: 303 zusaetzlich gefaltete Funde, davon 0 mit anderer
  // Strassennummer, 0 Severity-Verlust, 0 Restbreiten-Verlust, 0 ohne Herkunftsvermerk.
  it("Cross-Source gleich-schwer auf DERSELBEN Strasse → EIN Fund, zweite Quelle bleibt lesbar (T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 Quelle X", severity: "warnung", strassenRef: "A61", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "A61 Quelle Y", severity: "warnung", strassenRef: "A61", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].titel).toBe("A61 Quelle X")
    expect(out[0].detail["Auch gemeldet"]).toBe("Quelle Y: A61 Quelle Y")
  })

  // DIE WICHTIGERE RICHTUNG, und der Grund, warum Max' Vorsatz bestehen bleibt: zwei gleich
  // schwere Funde auf VERSCHIEDENEN Strassen sind zwei Massnahmen, nicht eine Doppelmeldung.
  // An einem Autobahnkreuz liegen sie zwangslaeufig dicht beieinander.
  it("faltet gleich-schwere Funde auf VERSCHIEDENEN Strassen NICHT (Kreuzungs-Aeste, T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A1 | Moseltal - Rioler Wald", severity: "warnung", strassenRef: "A1", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "A602 Arbeiten an Schutzeinrichtungen", severity: "warnung", strassenRef: "A602", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(2)
  })

  // Und ebenso wenig, wenn die Strasse gar nicht bekannt ist: ohne Beleg wird nicht gefaltet.
  it("faltet gleich-schwer nicht, wenn eine Strassenangabe fehlt (T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "Baustelle ohne Ref", severity: "warnung", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "Andere ohne Ref", severity: "warnung", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(2)
  })

  it("Cross-Source gleich-schwer: die kleinere Restbreite entscheidet, wer stehen bleibt (T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 breit", severity: "warnung", restbreiteM: 14, strassenRef: "A61", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "A61 eng", severity: "warnung", restbreiteM: 4, strassenRef: "A61", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].titel).toBe("A61 eng")
    expect(out[0].detail["Auch gemeldet"]).toBe("Quelle X: A61 breit — Restbreite 14,00 m")
  })

  // Der Vermerk steht in derselben Ansicht wie die Titel der uebrigen Funde, und die sind
  // humanisiert. Stuende hier der rohe Quell-String, waere fuer den Leser nicht erkennbar, dass
  // es dieselbe Meldung ist.
  it("Cross-Source: der Titel im Vermerk ist humanisiert wie jeder andere Titel (T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A44 - Fahrbahninstandsetzung - AkD 31550 - 1-str. R KS - 19h bis 6h - Lage-1", severity: "hinweis", quelle: { name: "BAB AkD" } }),
      f({ km: 28.35, titel: "A44 | Büren - Wünnenberg-Haaren", severity: "kritisch", quelle: { name: "Autobahn GmbH" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].detail["Auch gemeldet"]).toBe("BAB AkD: A44 - Fahrbahninstandsetzung")
  })

  // Auch der schon vorher gedroppte, schwaechere Fund verschwand bis dahin SPURLOS — der
  // Disponent sah nicht, dass es eine zweite Meldung gab.
  it("Cross-Source: auch beim Severity-Drop bleibt die Herkunft der gedroppten Meldung stehen (T-708)", () => {
    const out = dedupeFindings([
      f({ km: 28.3, titel: "A61 schwach", severity: "hinweis", quelle: { name: "Quelle X" } }),
      f({ km: 28.35, titel: "A61 stark", severity: "kritisch", quelle: { name: "Quelle Y" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
    expect(out[0].detail["Auch gemeldet"]).toBe("Quelle X: A61 schwach")
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

// T-708: der Herkunfts-Vermerk entsteht in dedupeFindings/dropCrossSourceDuplicates — die beiden
// NACHGELAGERTEN Stufen fassen aber ebenfalls per Object.assign zusammen und ersetzten `detail`
// dabei als Ganzes. Gemessen ueber die 38 ausgewerteten Projekte (ohne die zwei T-705-Projekte):
// von 306 weggefallenen Funden trugen ohne diese Absicherung nur 280 ihren Vermerk bis ins
// Ergebnis, mit ihr 305 — der eine verbleibende ist nachgeprueft und an derselben Stelle durch
// einen mindestens gleich schweren Fund gedeckt.
describe("Herkunfts-Vermerk ueberlebt die nachgelagerten Merge-Stufen (T-708)", () => {
  const mitVermerk = (over = {}) => f({ detail: { "Auch gemeldet": "Quelle Y: A61 Quelle Y" }, ...over })

  it("dedupeByObstacle: derselbe Hindernis-Punkt auf zwei Strecken", () => {
    const out = dedupeByObstacle([
      mitVermerk({ obstacleId: "o1", routeId: "r1", severity: "warnung" }),
      f({ obstacleId: "o1", routeId: "r2", severity: "kritisch", detail: { Restbreite: "3,00 m" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
    expect(out[0].detail["Auch gemeldet"]).toBe("Quelle Y: A61 Quelle Y")
  })

  it("dedupeByLocation: Bruecken-Richtungszwillinge am selben Punkt", () => {
    const p = { lat: 51.6467, lng: 7.9141, kategorie: "bruecke", geom: null, km: 6.94 }
    const out = dedupeByLocation([
      mitVermerk({ ...p, severity: "warnung" }),
      f({ ...p, lat: 51.64677, lng: 7.91412, severity: "kritisch", detail: { "Zul. Brückenlast": "40,0 t" } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe("kritisch")
    expect(out[0].detail["Auch gemeldet"]).toBe("Quelle Y: A61 Quelle Y")
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
    expect(humanizeTitel("UF WW/UF WW -", "bruecke")).toBe("Unterführung WW") // T-611: Dup-Collapse zuerst, dann UF→Unterführung
  })
  it("Brücke: Richtungs-/Teilbauwerk-Tail + FR-Suffix raus", () => {
    expect(humanizeTitel("Ahsebrücke FR Hannover", "bruecke")).toBe("Ahsebrücke")
    expect(humanizeTitel("BW 2026 - Brücke über die Harste im Zuge der A 7/Ostseite", "bruecke"))
      .toBe("Brücke über die Harste im Zuge der A 7") // T-610: führende BW-Nr gestrippt
    expect(humanizeTitel("Del25 / A28 über Geh-und Radweg in km 119,193/RiFa Oldenburg - Brücke", "bruecke"))
      .toBe("Del25 / A28 über Geh-und Radweg") // T-611 Beauty: km-Tail jetzt gestrippt
  })
  it("Baustelle: AkD-/Lage-/Zeit-Codes raus", () => {
    expect(humanizeTitel("A44 - Fahrbahninstandsetzung - AkD 31550 - 1-str. R KS - 19h bis 6h - Lage-1", "baustelle"))
      .toBe("A44 - Fahrbahninstandsetzung")
    expect(humanizeTitel("A24 Fahrbahninstandsetzung AM Fahrbinde (ARV 2024-372 NOO-2024-0124) - Lage-10 - 23.06.2026", "baustelle"))
      .toBe("A24 Fahrbahninstandsetzung AM Fahrbinde")
  })
  it("FR-Suffix auf einer Hälfte bricht den Dup-Collapse NICHT (Reihenfolge)", () => {
    expect(humanizeTitel('A2 / Gem-Str. "An der Windmühle"/A2 / Gem-Str. "An der Windmühle", FR Hannover', "bruecke"))
      .toBe('A2 / Gem-Str. "An der Windmühle"')
  })
  it("T-610: BASt-Kataster-Codes (BW-Nr, i.Z.d., FR:) raus", () => {
    expect(humanizeTitel("Bw 26 - Brücke ü.d. L564 i.Z.d. BAB A7", "bruecke")).toBe("Brücke ü.d. L564")
    expect(humanizeTitel("BW 16, Brücke ü. Graben i.Z.d. A 7 in km 272,903", "bruecke")).toBe("Brücke ü. Graben")
    expect(humanizeTitel("A5; Ufg des Saalbaches bei Karlsdorf/A5; Ufg des Saalbaches bei Karlsdorf; FR: F", "bruecke")).toBe("A5; Unterführung des Saalbaches bei Karlsdorf")
  })
  it("saubere Titel bleiben unverändert; nie leer", () => {
    expect(humanizeTitel("Datteln-Hamm-Kanal", "bruecke")).toBe("Datteln-Hamm-Kanal")
    expect(humanizeTitel("Am Eifeltor", "bruecke")).toBe("Am Eifeltor")
    expect(humanizeTitel("Lage-1", "baustelle")).toBe("Lage-1") // Fallback statt leer
  })
})
