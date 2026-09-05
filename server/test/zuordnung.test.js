// Zuordnungsnachweis statt Kreuzungsfilter (T-653).
//
// Geprueft wird das, was teuer waere, wenn es kippt:
//   1. Eine Ueberfuehrung ueber unsere Fahrbahn muss verschwinden.
//   2. Eine Bruecke, ueber die wir fahren, muss BLEIBEN. Das ist der schlimmere Fehler.
//   3. Ohne Nachweis wird nichts geloescht, sondern "unbestimmt" gemeldet.
//   4. Der Ortsbezug muss wirken: dieselbe Bruecke 300 km weiter darf nicht mitentscheiden.

import { describe, it, expect } from "vitest"
import {
  LOKAL_FENSTER_M,
  strassenBeiKm,
  strassenSpannenBauen,
  zuordnung,
  kannWiderlegtWerden,
  istBauwerk,
  istMassRestriktion,
} from "../src/engine/index.js"
import { cumulativeKm } from "../src/engine/geometry.js"

// Eine gerade Nord-Sued-Route bei Kassel, rund 111 km lang (1 Grad Breite).
const route = Array.from({ length: 101 }, (_, i) => ({ lat: 51.0 + i * 0.01, lng: 9.5 }))
const cum = cumulativeKm(route)

/** Spannen von Hand, damit der Test nicht von OSRM abhaengt. */
const spannen = strassenSpannenBauen(
  [
    { ref: "A7", punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] },
    { ref: "A44", punkte: [{ lat: 51.6, lng: 9.5 }, { lat: 51.9, lng: 9.5 }] },
  ],
  route,
  cum,
  null,
)

const beiKm = (km) => [...strassenBeiKm(spannen, km)].sort()

describe("strassenSpannenBauen / strassenBeiKm", () => {
  it("ordnet jede Strasse dem Stueck Route zu, auf dem sie gefahren wird", () => {
    expect(spannen.map((s) => s.ref)).toEqual(["A7", "A44"])
    expect(spannen[0].vonKm).toBeCloseTo(0, 1)
    expect(spannen[0].bisKm).toBeCloseTo(33.4, 0)
  })

  it("kennt am Anfang die A7 und am Ende die A44, nicht beide ueberall", () => {
    expect(beiKm(10)).toEqual(["A7"])
    expect(beiKm(80)).toEqual(["A44"])
  })

  // Der Kern des Ortsbezugs: dazwischen faehrt die Route auf keiner der beiden. Frueher galt die
  // globale Menge, dort waeren an JEDEM Kilometer beide Strassen "befahren" gewesen.
  it("meldet auf dem Zwischenstueck keine der beiden Strassen", () => {
    expect(beiKm(50)).toEqual([])
  })

  it("greift ueber die Fenstergrenze hinaus, aber nicht weiter", () => {
    const endeA7 = spannen[0].bisKm
    expect(strassenBeiKm(spannen, endeA7 + LOKAL_FENSTER_M / 1000 - 0.05).has("A7")).toBe(true)
    expect(strassenBeiKm(spannen, endeA7 + LOKAL_FENSTER_M / 1000 + 0.5).has("A7")).toBe(false)
  })

  it("liefert ohne Spannen ein LEERES Set, nicht etwa alle Strassen", () => {
    expect(strassenBeiKm([], 10).size).toBe(0)
    expect(strassenBeiKm(null, 10).size).toBe(0)
  })
})

const ctx = { strassenSpannen: spannen }
const bauwerk = (attrs, extra = {}) => ({ kategorie: "bruecke", attrs, ...extra })

describe("zuordnung", () => {
  // Max' Fall: eine Kreisstrasse fuehrt ueber die A7, wir fahren unten durch.
  it("widerlegt die Ueberfuehrung ueber unsere Fahrbahn", () => {
    const b = bauwerk({ getrageneStrasse: "K 12", gekreuzteStrasse: "A 7", maxGewichtT: 40 })
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
  })

  // In den Prod-Daten gefunden: sehr viele Bauwerke nennen NUR die gekreuzte Strasse, etwa
  // "A5; Ueberfuehrung Wirtschaftsweg Rittmatte" oder "Bruecke GVS Grundfeld-Reundorf ueber die
  // A73". Wer den Wirtschaftsweg traegt, steht nirgends und interessiert auch nicht. Eine erste
  // Fassung dieser Funktion verlangte beide Felder und liess genau diese Faelle stehen.
  it("widerlegt auch, wenn NUR die gekreuzte Strasse genannt ist", () => {
    const b = bauwerk({ gekreuzteStrasse: "A 7", maxGewichtT: 40 })
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
  })

  // Gegenprobe: nennt es nur die gekreuzte Strasse, und die fahren wir HIER nicht, ist nichts bewiesen.
  it("verwirft nicht, wenn die gekreuzte Strasse hier gar nicht gefahren wird", () => {
    const b = bauwerk({ gekreuzteStrasse: "A 44", maxGewichtT: 40 })
    expect(zuordnung(b, ctx, 10)).toBe("unbestimmt")
  })

  // Der teurere Fehler waere der umgekehrte. Deshalb hier doppelt hinsehen.
  it("BEHAELT die Bruecke, ueber die wir fahren", () => {
    const b = bauwerk({ getrageneStrasse: "A 7", gekreuzteStrasse: "K 12", maxGewichtT: 40 })
    expect(zuordnung(b, ctx, 10)).toBe("bewiesen")
  })

  // Genau der Fall, an dem der globale Vergleich scheiterte: die Bruecke liegt am Streckenanfang,
  // die A44 faehrt die Route erst 80 km spaeter. Global galt sie damit als befahren. Ortsbezogen
  // ist sie es nicht, und weil die getragene Strasse bekannt ist, folgt daraus der Umkehrschluss:
  // wir fahren hier nicht auf ihr, also nicht ueber das Bauwerk.
  it("verwirft, wenn die getragene Strasse hier nicht gefahren wird", () => {
    const b = bauwerk({ getrageneStrasse: "A 44", gekreuzteStrasse: "K 12", maxGewichtT: 40 })
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
    // 80 km weiter faehrt die Route die A44 tatsaechlich — dort bleibt dieselbe Bruecke stehen.
    expect(zuordnung(b, ctx, 80)).toBe("bewiesen")
  })

  // 129 Bauwerke im Bestand tragen in beiden Feldern dieselbe Strasse, weil der Connector den
  // ersten Treffer je Feld nimmt. Aus einer kaputten Angabe darf kein Loeschen folgen.
  it("verwirft NICHT, wenn getragene und gekreuzte Strasse identisch sind", () => {
    const b = bauwerk({ getrageneStrasse: "A 7", gekreuzteStrasse: "A 7", maxGewichtT: 40 })
    // "unbestimmt", nicht "bewiesen": aus zwei gleichen Werten laesst sich weder das eine noch
    // das andere folgern. Entscheidend ist nur, dass NICHT verworfen wird.
    expect(zuordnung(b, ctx, 10)).toBe("unbestimmt")
  })

  it("meldet unbestimmt, wenn das Bauwerk gar nichts ueber seine Lage sagt", () => {
    expect(zuordnung(bauwerk({ maxGewichtT: 40 }), ctx, 10)).toBe("unbestimmt")
  })

  // Eine Durchfahrtshoehe SAGT bereits "du faehrst drunter". 12.335 Bauwerke im Bestand, keines
  // davon mit getragener Strasse. Die duerfen nie in die Oben-Unten-Regel laufen.
  it("nimmt eine reine Durchfahrtshoehe immer an", () => {
    const b = bauwerk({ maxHoeheM: 3.8 })
    expect(zuordnung(b, ctx, 50)).toBe("bewiesen") // auch dort, wo wir keine Strasse kennen
  })

  // Die eigene Ref sagt beim Bauwerk nur "ich liege an der A7", nicht "du faehrst darueber".
  // Als Beweis genommen erklaerte sie jede Ueberfuehrung ueber unsere Fahrbahn zu unserer eigenen.
  it("nimmt die eigene Strassenangabe eines BAUWERKS nicht als Beweis", () => {
    expect(zuordnung(bauwerk({ maxGewichtT: 40 }, { strassenRef: "A7" }), ctx, 10)).toBe("unbestimmt")
  })

  it("nimmt sie bei einem Hindernis AUF der Strasse sehr wohl", () => {
    const baustelle = { kategorie: "baustelle", attrs: {}, strassenRef: "A7" }
    expect(zuordnung(baustelle, ctx, 10)).toBe("bewiesen")
    // Fremde Ref widerlegt NICHT — 25 von 34 Abweichungen gingen auf Luecken bei UNS zurueck.
    expect(zuordnung({ ...baustelle, strassenRef: "B62" }, ctx, 10)).toBe("unbestimmt")
  })

  // Sagt das lokale Fenster nichts (Ortsdurchfahrt, Rampe, unbenannte Strasse), darf die
  // Gesamtliste einspringen. Ein leeres Fenster ist keine Auskunft, kein Gegenbeweis.
  it("faellt bei leerem Fenster auf die Gesamtliste zurueck", () => {
    const leerAberBekannt = { strassenSpannen: spannen, refs: new Set(["A7"]) }
    const b = bauwerk({ getrageneStrasse: "K 12", gekreuzteStrasse: "A 7", maxGewichtT: 40 })
    // km 50 liegt zwischen den Spannen, das Fenster ist dort leer.
    expect(strassenBeiKm(spannen, 50).size).toBe(0)
    expect(zuordnung(b, leerAberBekannt, 50)).toBe("widerlegt")
  })

  // Aber genau dort, wo das Fenster etwas weiss, gewinnt es gegen die Gesamtliste. Sonst waere
  // der Ortsbezug wirkungslos.
  it("laesst die Gesamtliste NICHT gegen ein gefuelltes Fenster gewinnen", () => {
    const beides = { strassenSpannen: spannen, refs: new Set(["A7", "A44"]) }
    const b = bauwerk({ getrageneStrasse: "A 44", gekreuzteStrasse: "K 12", maxGewichtT: 40 })
    // Bei km 10 faehrt die Route A7, nicht A44 — global stuende A44 aber drin und haette die
    // Bruecke damit zu unserer erklaert.
    expect(zuordnung(b, beides, 10)).toBe("widerlegt")
  })

  // Der Umkehrschluss ist die scharfe Regel, deshalb greift er NUR bei gefuelltem Fenster. Ist es
  // leer, wissen wir ueber diese Stelle nichts, und aus Unwissen darf kein Loeschen folgen.
  it("zieht den Umkehrschluss nicht aus einem leeren Fenster", () => {
    const nurGlobal = { strassenSpannen: spannen, refs: new Set(["A7"]) }
    const b = bauwerk({ getrageneStrasse: "A 44", gekreuzteStrasse: "K 12", maxGewichtT: 40 })
    expect(strassenBeiKm(spannen, 50).size).toBe(0) // km 50 liegt zwischen den Spannen
    expect(zuordnung(b, nurGlobal, 50)).toBe("unbestimmt")
  })

  // Aus dem Namen gelesen, wenn kein Strukturfeld da ist. Max' Fall vom 31.08.2026.
  it("liest die getragene Strasse aus dem Namen, wenn die Quelle schweigt", () => {
    const b = { kategorie: "bruecke", name: "Brücke K BA 10 BW 6031578", attrs: { grundsaetzlicheGstSperre: true } }
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt") // wir fahren hier A7, nicht K BA 10
  })

  // Und die Bremse dazu: widersprechen sich Strukturfeld und Name, wird nicht verworfen.
  it("verwirft nicht, wenn Strukturfeld und Name sich widersprechen", () => {
    const b = {
      kategorie: "bruecke",
      name: "BW 3180, AK Hannover - Ost, A 7 über A 2",
      attrs: { getrageneStrasse: "A2", maxGewichtT: 40 },
    }
    expect(zuordnung(b, ctx, 10)).toBe("unbestimmt")
  })

  // "Ueberfuehrung X ueber UNSERE Strasse" — der Name allein reicht, auch wenn die Quelle in
  // beide Felder dasselbe geschrieben hat. Am 05.09.2026 gegen die Produktion gemessen: genau
  // 43 der 1.593 Bruecken-Warnungen, ALLE mit dieser kaputten Feldangabe.
  it("widerlegt die Ueberfuehrung aus dem Namen, wenn beide Felder dasselbe sagen", () => {
    const b = {
      kategorie: "bruecke",
      name: "BW 165 - Üf Gemeindestr. über A7, Ab 250, St 1255",
      attrs: { getrageneStrasse: "A7", gekreuzteStrasse: "A7", grundsaetzlicheGstSperre: true },
    }
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
  })

  it("liest auch den Fall ohne klassifizierte Strasse oben", () => {
    const b = { kategorie: "bruecke", name: "ÜF EINES WANDERWEGES ÜBER DIE A 7", attrs: { grundsaetzlicheGstSperre: true } }
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
  })

  // Die teure Gegenrichtung: wir fahren OBEN. Ein Loeschen waere hier der schlimmere Fehler,
  // deshalb steht die Probe hier und nicht nur im Kommentar. Gemessen blieben 558 solche
  // Bauwerke stehen.
  it("verwirft NICHT, wenn wir ueber das Bauwerk fahren", () => {
    const b = { kategorie: "bruecke", name: "Brücke A7 über den Entlesbach", attrs: { grundsaetzlicheGstSperre: true } }
    expect(zuordnung(b, ctx, 10)).not.toBe("widerlegt")
  })

  // Am Autobahnkreuz sind beide Strassen unsere. Dann sagt der Name nichts Eindeutiges mehr.
  it("verwirft nicht, wenn wir die obere Strasse hier auch fahren", () => {
    const beides = { strassenSpannen: spannen, refs: new Set(["A7", "A44"]) }
    const b = { kategorie: "bruecke", name: "ÜF der A44 über die A7", attrs: { grundsaetzlicheGstSperre: true } }
    // Bei km 10 kennt das Fenster nur die A7 — dort ist es eindeutig.
    expect(zuordnung(b, beides, 10)).toBe("widerlegt")
    // Von Hand ein Fenster, das beide fuehrt: kein Urteil.
    const kreuz = { strassenSpannen: [{ ref: "A7", vonKm: 0, bisKm: 100 }, { ref: "A44", vonKm: 0, bisKm: 100 }] }
    expect(zuordnung(b, kreuz, 10)).not.toBe("widerlegt")
  })

  it("urteilt ohne Streckenauskunft nie, sondern bleibt unbestimmt", () => {
    const b = bauwerk({ getrageneStrasse: "K 12", gekreuzteStrasse: "A 7", maxGewichtT: 40 })
    expect(zuordnung(b, { strassenSpannen: [] }, 10)).toBe("unbestimmt")
  })
})

describe("kannWiderlegtWerden (Vorab-Sieb)", () => {
  const refs = new Set(["A7", "A44"])

  it("laesst nur durch, was ueberhaupt widerlegbar waere", () => {
    expect(kannWiderlegtWerden(bauwerk({ getrageneStrasse: "K 12", gekreuzteStrasse: "A 7" }), refs)).toBe(true)
    expect(kannWiderlegtWerden(bauwerk({ getrageneStrasse: "A 7", gekreuzteStrasse: "B 62" }), refs)).toBe(false)
    expect(kannWiderlegtWerden(bauwerk({ maxHoeheM: 3.8 }), refs)).toBe(false)
    expect(kannWiderlegtWerden(bauwerk({ getrageneStrasse: "A 7", gekreuzteStrasse: "A 7" }), refs)).toBe(false)
  })

  // Fail-open: ohne OSRM-Auskunft wird nichts verworfen.
  it("verneint ohne Streckenrefs", () => {
    const b = bauwerk({ getrageneStrasse: "K 12", gekreuzteStrasse: "A 7" })
    expect(kannWiderlegtWerden(b, null)).toBe(false)
    expect(kannWiderlegtWerden(b, new Set())).toBe(false)
  })

  // Das Sieb darf nie strenger sein als das Urteil, sonst verschwaende ein Drop unbemerkt.
  it("ist niemals strenger als zuordnung() selbst", () => {
    const faelle = [
      { getrageneStrasse: "K 12", gekreuzteStrasse: "A 7", maxGewichtT: 40 },
      { getrageneStrasse: "A 7", gekreuzteStrasse: "K 12", maxGewichtT: 40 },
      { getrageneStrasse: "A 7", gekreuzteStrasse: "A 7", maxGewichtT: 40 },
      { maxHoeheM: 3.8 },
      { maxGewichtT: 40 },
    ]
    for (const attrs of faelle) {
      const b = bauwerk(attrs)
      if (zuordnung(b, ctx, 10) === "widerlegt") {
        expect(kannWiderlegtWerden(b, new Set(["A7", "A44"]))).toBe(true)
      }
    }
  })
})

// Max, 01.09.2026, an einem "Durchfahrt verboten · Sandbochumer Weg" mitten in einer
// Autobahn-Auswertung: "auch wenn ich nicht Hausnummer und so weiss, weiss ich ja, dass wenn es
// auf dem Sandbochumer Weg liegt, es NICHT auf der AUTOBAHN liegt."
describe("Benannte Strassen: was zu einer anderen Strasse gehoert, faellt weg", () => {
  const ctx = { strassenSpannen: spannen, refs: new Set(["A7", "A44"]) }
  const verbot = (strassenRef) => ({ kategorie: "gewicht", strassenRef, attrs: {} })

  it("verwirft ein Verbot auf einer Gemeindestrasse, wenn wir dort Autobahn fahren", () => {
    expect(zuordnung(verbot("Sandbochumer Weg"), ctx, 10)).toBe("widerlegt")
  })

  it("bestaetigt es, wenn die Route genau diese Strasse faehrt", () => {
    const mitNamen = strassenSpannenBauen(
      [{ ref: null, name: "sandbochumerweg", punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] }],
      route, cum, null,
    )
    expect(zuordnung(verbot("Sandbochumer Weg"), { strassenSpannen: mitNamen }, 10)).toBe("bewiesen")
  })

  it("schweigt, wo die Route ihre eigene Strasse nicht kennt", () => {
    // Leeres Fenster heisst Unwissen, nicht Gegenbeweis — dieselbe Lehre wie bei den Nummern.
    expect(zuordnung(verbot("Sandbochumer Weg"), { strassenSpannen: [] }, 10)).toBe("unbestimmt")
  })

  it("fasst Bauwerke nicht an: dort sagt die Strassenangabe nichts ueber oben oder unten", () => {
    const bruecke = { kategorie: "bruecke", strassenRef: "Sandbochumer Weg", attrs: {}, name: "Bruecke" }
    expect(zuordnung(bruecke, ctx, 10)).toBe("unbestimmt")
  })

  it("laesst zu kurze Namen in Ruhe — sie unterscheiden nicht", () => {
    expect(zuordnung(verbot("Am"), ctx, 10)).toBe("unbestimmt")
  })

  // Innerorts heisst eine Bundesstrasse oft zusaetzlich wie eine Gemeindestrasse. Kennt die Route
  // den Namen, muss er gewinnen — sonst faellt ein Fund weg, der uns wirklich gilt.
  it("erkennt eine Strasse, die Nummer UND Name traegt", () => {
    const beides = strassenSpannenBauen(
      [{ ref: "B54", name: "hauptstrasse", punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] }],
      route, cum, null,
    )
    expect(zuordnung(verbot("Hauptstraße"), { strassenSpannen: beides }, 10)).toBe("bewiesen")
  })
})

// Das Sieb ist die schaerfste Stelle der Kette: was hier durchfaellt, wird ohne Nachfrage als
// "bewiesen" behandelt und zuordnung() sieht es nie. Genau daran scheiterte der Sandbochumer Weg
// am 01.09.2026 — der Namensvergleich war fertig, getestet und ausgerollt, und der Fund stand
// nach einer neuen Auswertung trotzdem noch da.
describe("kannWiderlegtWerden laesst durch, was zuordnung() beurteilen muss", () => {
  const refs = new Set(["A1", "A7"])

  it("laesst eine Sperrung mit benannter Strasse zur Pruefung durch", () => {
    expect(kannWiderlegtWerden({ kategorie: "sperrung", strassenRef: "Sandbochumer Weg", attrs: {} }, refs)).toBe(true)
    expect(kannWiderlegtWerden({ kategorie: "gewicht", strassenRef: "Corneliusstraße", attrs: {} }, refs)).toBe(true)
  })

  it("siebt weiter aus, was ohnehin nicht zu widerlegen ist", () => {
    // Nummer statt Name: darueber entscheidet der Ref-Vergleich, nicht der Namensvergleich.
    expect(kannWiderlegtWerden({ kategorie: "sperrung", strassenRef: "A1", attrs: {} }, refs)).toBe(false)
    // Gar keine Strassenangabe.
    expect(kannWiderlegtWerden({ kategorie: "sperrung", attrs: {} }, refs)).toBe(false)
    // Reine Durchfahrtshoehe sagt schon "du faehrst drunter durch".
    expect(kannWiderlegtWerden({ kategorie: "bruecke", strassenRef: "Am Weg", attrs: { maxHoeheM: 4.2 } }, refs)).toBe(false)
  })
})

describe("istBauwerk", () => {
  it("gilt nur fuer Bruecke und Tunnel", () => {
    expect(istBauwerk({ kategorie: "bruecke" })).toBe(true)
    expect(istBauwerk({ kategorie: "tunnel" })).toBe(true)
    expect(istBauwerk({ kategorie: "baustelle" })).toBe(false)
    expect(istBauwerk(null)).toBe(false)
  })
})

// T-654: das Zeichen-253-Verbot ist eine Massbeschraenkung wie jede andere, und ohne diese Zeile
// lief der Kreuzungsfilter bei 73,5 Prozent der Gewichts-Hindernisse gar nicht erst an.
describe("istMassRestriktion", () => {
  it("kennt das Lkw-Durchfahrtsverbot", () => {
    expect(istMassRestriktion({ verkehrsverbotLkwT: 3.5 })).toBe(true)
  })

  it("kennt weiterhin Hoehe, Breite und Bruecken-Traglast", () => {
    expect(istMassRestriktion({ maxHoeheM: 4.2 })).toBe(true)
    expect(istMassRestriktion({ maxBreiteM: 3 })).toBe(true)
    expect(istMassRestriktion({ maxGewichtT: 40 })).toBe(true)
  })

  // Die Gegenrichtung ist die wichtige: was KEIN Mass traegt, darf der Filter nicht anfassen.
  // Eine Baustelle ohne Massangabe laeuft in den allgemeinen Kreuzungsfilter (T-611), nicht in
  // diesen hier — der ist strenger und verlangt deckungsgleichen Mitlauf.
  it("greift nicht ohne Massangabe", () => {
    expect(istMassRestriktion({ vollsperrung: true })).toBe(false)
    expect(istMassRestriktion({})).toBe(false)
    expect(istMassRestriktion(null)).toBe(false)
  })
})
