// Anzeige-Logik der Fund-Details (T-733: erste Frontend-Tests des Projekts).
//
// Zwei Dinge hängen hier zusammen und werden beide gehalten:
//  1. WELCHE Detail-Zeilen ein Bericht zeigt (sichtbaresDetail, T-664/F2)
//  2. WIE ein Attributwert für den Kunden aussieht (attrEntries → formatAttrValue, T-664/F8)

import { describe, it, expect } from "vitest"
import { sichtbaresDetail, attrEntries, attrLabel, INTERNE_DETAIL_SCHLUESSEL } from "./findingMeta"

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
