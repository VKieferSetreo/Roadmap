// Anzeige-Logik der Fund-Details (T-733: erste Frontend-Tests des Projekts).
//
// Zwei Dinge hängen hier zusammen und werden beide gehalten:
//  1. WELCHE Detail-Zeilen ein Bericht zeigt (sichtbaresDetail, T-664/F2)
//  2. WIE ein Attributwert für den Kunden aussieht (attrEntries → formatAttrValue, T-664/F8)

import { describe, it, expect } from "vitest"
import {
  sichtbaresDetail,
  attrEntries,
  attrLabel,
  breitenLabel,
  ENGSTELLE_GRENZE_M,
  INTERNE_DETAIL_SCHLUESSEL,
} from "./findingMeta"

// T-664/F2: PDF, CSV und die aufgeklappte Fundliste serialisierten `Object.entries(f.detail)` roh,
// nur die Karte filterte. Gemessen: 344 Funde in 45 von 67 Projekten trugen `__ki` im Bericht,
// 177 davon mit leerem Array — die standen als „__ki: " ganz ohne Wert im Kundendokument.
// Die Gegenrichtung ist genauso wichtig und steht so im Code-Kommentar: „Zuordnung", „Zeitraum"
// und „Gilt" sind fachliche Vorbehalte. Wer sie im Bericht wegfiltert, nimmt dem Leser die
// ehrliche Einschränkung — deshalb prüft jeder Test hier BEIDE Seiten.
describe("sichtbaresDetail", () => {
  it("wirft die internen Marker raus und lässt die fachlichen Angaben stehen", () => {
    const detail = {
      Zuordnung: "nicht nachweisbar",
      __ki: "",
      Zeitraum: "01.09.2026 – 30.09.2026",
      Ergänzt: "Vollsperrung: true",
      Gilt: "für Fahrzeuge über 3,5 t",
      __marker: "x",
    }
    expect(sichtbaresDetail(detail)).toEqual([
      ["Zuordnung", "nicht nachweisbar"],
      ["Zeitraum", "01.09.2026 – 30.09.2026"],
      ["Gilt", "für Fahrzeuge über 3,5 t"],
    ])
  })

  it("entfernt auch ein __ki ohne Wert — genau die 177 Zeilen, die als leeres __ki im Bericht standen", () => {
    expect(sichtbaresDetail({ __ki: [] })).toEqual([])
  })

  it("behält den Vorbehalt Zuordnung auch dann, wenn er die einzige Detail-Zeile ist", () => {
    expect(sichtbaresDetail({ Zuordnung: "nicht nachweisbar" })).toEqual([
      ["Zuordnung", "nicht nachweisbar"],
    ])
  })

  it("verträgt einen Fund ganz ohne Detail-Objekt", () => {
    expect(sichtbaresDetail(undefined)).toEqual([])
    expect(sichtbaresDetail(null)).toEqual([])
  })

  it("erkennt genau die internen Schlüssel als intern", () => {
    expect(INTERNE_DETAIL_SCHLUESSEL("__ki")).toBe(true)
    expect(INTERNE_DETAIL_SCHLUESSEL("Ergänzt")).toBe(true)
    expect(INTERNE_DETAIL_SCHLUESSEL("Zuordnung")).toBe(false)
    expect(INTERNE_DETAIL_SCHLUESSEL("Zeitraum")).toBe(false)
    expect(INTERNE_DETAIL_SCHLUESSEL("Gilt")).toBe(false)
  })
})

// T-664/F8: 28.869 von 72.746 aktiven Hindernissen (39,7 Prozent) trugen mindestens ein Attribut
// ohne Label — im Popup stand der Rohname des Feldes. Dazu der Text-Fall: die KI-Anreicherung legt
// ihre Werte als Zeichenkette ab, deshalb las der Kunde „true" statt „ja" und „3.5" ohne Einheit.
// Gemessen: 3.377 mal umleitung als String, 2.056 mal vollsperrung, 1.794 mal fahrbahnVerengt.
describe("attrEntries — Zahlen", () => {
  it("hängt die Einheit an und schreibt das Komma deutsch", () => {
    expect(attrEntries({ maxHoeheM: 4.5 })).toEqual([
      { label: "Durchfahrtshöhe", value: "4,5 m", ausKi: false },
    ])
  })

  it("trennt Tausender deutsch, nicht englisch", () => {
    expect(attrEntries({ maxLaengeM: 1234.5 })[0].value).toBe("1.234,5 m")
  })

  it("lässt ein Feld ohne bekannte Einheit ohne Einheit stehen", () => {
    expect(attrEntries({ anzahlFahrstreifen: 2 })).toEqual([
      { label: "Fahrstreifen (verbleibend)", value: "2", ausKi: false },
    ])
  })
})

describe("attrEntries — Wahrheitswerte", () => {
  it("zeigt echte booleans als ja und nein statt als true und false", () => {
    const zeilen = attrEntries({ vollsperrung: true, halbseitig: false } as unknown as Record<
      string,
      string | number
    >)
    expect(zeilen.map((z) => z.value)).toEqual(["ja", "nein"])
  })

  // Das ist der eigentliche T-664/F8-Fall: die Werte kommen als TEXT aus der KI-Anreicherung.
  it("zeigt auch die als Text abgelegten KI-Werte als ja und nein", () => {
    expect(attrEntries({ vollsperrung: "true" })[0].value).toBe("ja")
    expect(attrEntries({ umleitung: "false" })[0].value).toBe("nein")
  })
})

describe("attrEntries — Zahlen, die als Text ankommen", () => {
  it("macht aus dem Text 3.5 eine deutsche Zahl mit Einheit", () => {
    expect(attrEntries({ maxHoeheM: "3.5" })[0].value).toBe("3,5 m")
  })

  it("versteht dieselbe Zahl auch mit deutschem Komma", () => {
    expect(attrEntries({ maxGewichtT: "3,5" })[0].value).toBe("3,5 t")
  })

  // Schutz gegen die naheliegende Übervereinfachung „jede Zahl im Text ist eine Maßzahl":
  // getrageneStrasse trägt keine Einheit, „1234" ist die Straßennummer B 1234 und darf nicht
  // als „1.234" mit Tausenderpunkt erscheinen.
  it("lässt eine Straßennummer eine Nummer bleiben und macht keine 1.234 daraus", () => {
    expect(attrEntries({ getrageneStrasse: "1234" })[0].value).toBe("1234")
  })

  it("lässt Freitext unverändert stehen", () => {
    expect(attrEntries({ richtung: "Fahrtrichtung Norden" })[0].value).toBe("Fahrtrichtung Norden")
  })
})

// T-664/F8: 13 verschiedene Rohwerte auf 9.294 Hindernissen, angeführt von roadClosed mit 4.679.
// Der Kunde las bisher „roadClosed" im Popup.
describe("attrEntries — Art der Sperrung", () => {
  it("übersetzt den DATEX2-Rohwert in einen Satz, den der Disponent lesen kann", () => {
    expect(attrEntries({ sperrungArt: "roadClosed" })).toEqual([
      { label: "Art der Sperrung", value: "Straße gesperrt", ausKi: false },
    ])
  })

  it("zeigt einen unbekannten Rohwert unverändert, statt ihn zu verschlucken", () => {
    expect(attrEntries({ sperrungArt: "irgendwasNeues" })[0].value).toBe("irgendwasNeues")
  })
})

describe("attrLabel und die KI-Markierung", () => {
  it("fällt bei unbekanntem Schlüssel auf den Rohnamen zurück, statt undefined zu zeigen", () => {
    expect(attrLabel("nochNichtGepflegtesFeld")).toBe("nochNichtGepflegtesFeld")
    expect(attrEntries({ nochNichtGepflegtesFeld: 1 })[0].label).toBe("nochNichtGepflegtesFeld")
  })

  // T-657: nur die aus dem Beschreibungstext gelesenen Felder tragen das Zeichen — sonst
  // behauptet die Ansicht bei gemeldeten Werten eine Unsicherheit, die es nicht gibt.
  it("markiert nur die Felder als KI-Herkunft, die wirklich aus dem Text gelesen wurden", () => {
    const zeilen = attrEntries({ maxHoeheM: 4.2, maxBreiteM: 3 }, ["maxHoeheM"])
    expect(zeilen.map((z) => [z.label, z.ausKi])).toEqual([
      ["Durchfahrtshöhe", true],
      ["Restbreite", false],
    ])
  })
})

// T-711: „Restbreite 14,00 m" stand direkt neben „Transportbreite 4,20 m" und las sich als
// Datenfehler. Gemessen am 07.09.2026 an der Produktion:
//  · 2.822 aktive Hindernisse mit numerischem restbreiteM — Median 4,50 m, p75 6,75 m, p90 8,00 m,
//    Maximum 17,50 m; 1.080 davon (38,3 %) bei 6,00 m oder darüber, 1.066 aus der Autobahn-API.
//  · 922 Fund-Detail-Zeilen „Restbreite", davon 516 über 6,00 m — und ALLE 516 sind Warnungen,
//    keine einzige ist kritisch. Kein Fund hat eine Restbreite ab 6,00 m, die kleiner als seine
//    Transportbreite wäre (0 von 564).
//  · Die größte im Bestand erfasste Transportbreite ist 6,00 m (82 Projekte, Median 4,35 m).
// Daraus die Grenze: ein Wert ÜBER 6,00 m kann keine Engstelle mehr beschreiben.
// Geändert wird NUR das Wort. Der Wert bleibt in der Zeile, die Zeile bleibt im Bericht, die
// Engine rechnet unverändert mit der Zahl.
describe("T-711 Restbreite über der Engstellen-Grenze", () => {
  it("hält die gemessene Grenze fest, damit sie nicht unbemerkt verschoben wird", () => {
    expect(ENGSTELLE_GRENZE_M).toBe(6.0)
  })

  it("nennt eine Breite über der Grenze im Fund-Detail beim richtigen Namen", () => {
    // Der Originalfall aus der Produktion (A5 | Appenweier - Achern, Quelle 0001).
    expect(sichtbaresDetail({ Restbreite: "14,00 m", Transportbreite: "4,20 m" })).toEqual([
      ["Freie Fahrbahnbreite", "14,00 m"],
      ["Transportbreite", "4,20 m"],
    ])
  })

  it("nennt sie auch im Hindernis-Popup beim richtigen Namen, für beide Breiten-Attribute", () => {
    expect(attrEntries({ restbreiteM: 14 })[0].label).toBe("Freie Fahrbahnbreite")
    // maxBreiteM trägt im FE dasselbe Wort „Restbreite". Gemessen: 3.446 Werte, Median 3,75 m,
    // genau EINER ab 6 m (13,00 m) — selten, aber derselbe Lesefehler.
    expect(attrEntries({ maxBreiteM: 13 })[0].label).toBe("Freie Fahrbahnbreite")
  })

  // ── GEGENPROBE 1: echte Engstellen dürfen sich um KEIN Zeichen ändern ────────────────────
  it("lässt jede echte Engstelle unter der Grenze Zeichen für Zeichen unverändert", () => {
    // p25 3,25 m · Median 4,50 m · und der knappste Wert, den der Bestand unter 6 m kennt (5,95 m).
    for (const wert of ["3,25 m", "4,50 m", "5,50 m", "5,95 m"]) {
      expect(sichtbaresDetail({ Restbreite: wert, Transportbreite: "4,20 m" })).toEqual([
        ["Restbreite", wert],
        ["Transportbreite", "4,20 m"],
      ])
    }
    for (const wert of [0.5, 3.25, 4.5, 5.85, 5.95]) {
      expect(attrEntries({ restbreiteM: wert })[0].label).toBe("Restbreite")
    }
  })

  // Der Gleichstand ist der Grund für „strikt größer": 48 Funde tragen genau 6,00 m, einer davon
  // neben einer Transportbreite von 6,00 m. Dort passt der Transport exakt — eine echte Engstelle
  // ohne Reserve. Sie als „freie Fahrbahn" auszugeben wäre die gefährliche Richtung des Irrtums.
  it("behandelt genau 6,00 m weiterhin als Restbreite und erst 6,05 m als freie Fahrbahn", () => {
    expect(breitenLabel("Restbreite", "6,00 m")).toBe("Restbreite")
    expect(breitenLabel("Restbreite", 6)).toBe("Restbreite")
    expect(breitenLabel("Restbreite", "6,05 m")).toBe("Freie Fahrbahnbreite")
    expect(breitenLabel("Restbreite", 6.05)).toBe("Freie Fahrbahnbreite")
  })

  // DER FALL, DEN DIE GEGENPROBE GEFUNDEN HAT. Die feste 6,00-m-Schwelle ist die größte HEUTE
  // erfasste Transportbreite — über den nächsten Kunden sagt sie nichts. Führe jemand 6,50 m
  // breit, stünde an einer Restbreite von 6,20 m „Freie Fahrbahnbreite", obwohl die Engine
  // denselben Fund im selben Atemzug als KRITISCH einstuft: 6,20 m reichen nicht für 6,50 m.
  // Deshalb richtet sich die Grenze nach dem Transport, wenn seine Breite im Fund steht.
  it("nennt es Restbreite, solange der Transport selbst breiter ist als die Grenze", () => {
    const detail = sichtbaresDetail({ Transportbreite: "6,50 m", Restbreite: "6,20 m" })
    expect(detail).toContainEqual(["Restbreite", "6,20 m"])
    // Und die Gegenrichtung: liegt der Wert auch über der Transportbreite, stimmt das neue Wort.
    const weit = sichtbaresDetail({ Transportbreite: "6,50 m", Restbreite: "14,00 m" })
    expect(weit).toContainEqual(["Freie Fahrbahnbreite", "14,00 m"])
  })

  // Ohne Transportbreite im Fund bleibt es bei der Konstanten — der übliche Fall.
  it("faellt ohne Transportbreite auf die feste Grenze zurueck", () => {
    expect(breitenLabel("Restbreite", "8,00 m")).toBe("Freie Fahrbahnbreite")
    expect(breitenLabel("Restbreite", "8,00 m", null)).toBe("Freie Fahrbahnbreite")
  })

  // ── GEGENPROBE 2: kein anderes Feld darf mitkippen, nur weil seine Zahl groß ist ─────────
  it("fasst kein anderes Feld an, auch wenn dessen Zahl weit über der Grenze liegt", () => {
    expect(
      sichtbaresDetail({
        Transportbreite: "6,50 m", // ein Transport DARF breiter als die Grenze sein
        Durchfahrtshöhe: "14,00 m",
        "Länge der Maßnahme": "740 m",
        Marge: "9,80 m",
      }),
    ).toEqual([
      ["Transportbreite", "6,50 m"],
      ["Durchfahrtshöhe", "14,00 m"],
      ["Länge der Maßnahme", "740 m"],
      ["Marge", "9,80 m"],
    ])
    expect(attrEntries({ maxHoeheM: 14, sperrlaengeM: 740 }).map((z) => z.label)).toEqual([
      "Durchfahrtshöhe",
      "Länge der Maßnahme",
    ])
  })

  // ── GEGENPROBE 3: was wir nicht deuten können, benennen wir nicht um ─────────────────────
  it("schweigt bei einem Wert, der keine reine Maßangabe ist, statt zu raten", () => {
    for (const wert of ["unbekannt", "ca. 14 m", "6,50–14,00 m", "1.493,0 m", ""]) {
      expect(breitenLabel("Restbreite", wert)).toBe("Restbreite")
    }
  })

  // ── GEGENPROBE 4: NICHTS VERSCHWINDEN LASSEN ─────────────────────────────────────────────
  it("lässt Wert, Zeilenzahl und Reihenfolge unangetastet — nur das Wort ändert sich", () => {
    const detail = { Zeitraum: "Überschneidet", Restbreite: "15,00 m", Transportbreite: "3,00 m" }
    const zeilen = sichtbaresDetail(detail)
    expect(zeilen.map(([, v]) => v)).toEqual(Object.values(detail))
    expect(zeilen).toHaveLength(3)
    expect(zeilen[1][1]).toBe("15,00 m")
  })

  // Der stille Verlust, den die Umbenennung sonst verursacht hätte: FindingCard sucht die zu
  // markierende Zeile über `detail.__ki.includes(k)`. Ein umbenannter Schlüssel steht dort nicht
  // mehr, und das ✦ wäre ersatzlos weg. Gemessen: 0 von 922 Restbreiten-Zeilen sind KI-markiert
  // (die Anreicherung lieferte restbreiteM nur 13-mal, alle unter 6,00 m) — die Ausnahme kostet
  // heute nichts und hält die Herkunft trotzdem fest.
  it("behält den Schlüssel einer KI-markierten Zeile, damit ihr Herkunftszeichen nicht wegfällt", () => {
    const detail = { Restbreite: "14,00 m", __ki: ["Restbreite"] }
    expect(sichtbaresDetail(detail)).toEqual([["Restbreite", "14,00 m"]])
    // Ohne die Markierung greift die Umbenennung wie überall sonst.
    expect(sichtbaresDetail({ Restbreite: "14,00 m", __ki: ["Durchfahrtshöhe"] })).toEqual([
      ["Freie Fahrbahnbreite", "14,00 m"],
    ])
  })

  // Im Popup-Pfad hängt das Zeichen am ROHSCHLÜSSEL, nicht am Wort — dort geht bei der
  // Umbenennung nichts verloren, deshalb greift sie dort auch bei KI-Herkunft.
  it("markiert eine umbenannte Popup-Zeile weiterhin als KI-Herkunft", () => {
    expect(attrEntries({ restbreiteM: 14 }, ["restbreiteM"])).toEqual([
      { label: "Freie Fahrbahnbreite", value: "14 m", ausKi: true },
    ])
  })

  // attrLabel sieht nur den Schlüssel und kann die Grenze deshalb gar nicht kennen. Das ist
  // Absicht und festgehalten, damit niemand die Entscheidung dorthin verschiebt.
  it("entscheidet am Wert, nicht am Schlüssel — attrLabel bleibt wertfrei", () => {
    expect(attrLabel("restbreiteM")).toBe("Restbreite")
    expect(attrLabel("maxBreiteM")).toBe("Restbreite")
  })
})
