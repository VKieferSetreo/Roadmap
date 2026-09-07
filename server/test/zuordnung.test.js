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
  massgebendeLage,
} from "../src/engine/index.js"
import { cumulativeKm } from "../src/engine/geometry.js"
import { kreuztKeineStrasse, normRoadRef, normRoadRefWeit, strasseAusName } from "../src/external/osrm.js"

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

// T-699. Max, 06.09.2026, an "Mainbruecke Eddersheim" mit dem Zweifels-Schild: "aber bei sowas
// wie Mainbruecke weiss man das ja." Alle Namen hier woertlich aus dem Produktionsbestand.
describe("kreuztKeineStrasse — was ueberquert wird, ist keine Strasse (T-699)", () => {
  it("erkennt Gewaesser, Taeler, Kanaele und Bahnstrecken", () => {
    for (const n of [
      "Mainbrücke Eddersheim",
      "Rheinbrücke Bendorf",
      "Elbebrücke Hohewarthe RFB Berlin",
      "Moselbrücke Ehrang",
      "Saalebrücke/Saalevorland (Ü1, Ü2) Richtung Quedlinburg (Alsl.)",
      "Wupperbrücke Dahlhausen",
      "Talbrücke Fechingen",
      "Wiehltalbrücke",
      "Rhein-Herne-Kanal (westl. Überbau)",
      "Bahnbrücke/Brücke über die DB-AG",
    ]) expect(kreuztKeineStrasse(n), n).toBe(true)
  })

  // DIE WICHTIGE RICHTUNG. Nennt der Name eine klassifizierte Nummer, kann genau sie die
  // unterquerte sein, und ein "wir fahren drueber" waere falsch. Ohne diese Sperre traf das
  // Muster im Bestand 200 statt 139 Bauwerke — die Differenz sind genau solche Faelle.
  it("schweigt, sobald der Name IRGENDEINE Strassennummer nennt", () => {
    for (const n of [
      "UF K807 + Main + K808 - Mainbrücke Schwanheim-/Überbau FR Frankfurt",
      'Lahnbrücke am Taubenstein,UF Lahn,L 3020,Stadtstr./UF Lahn, L 3020 u. Stadtstrasse "Taubenstein"',
      "Brücke A3 über Main - Mainbrücke Randersacker/FR Frankfurt (linker Überbau)",
      "RUHRBRUECKE B54",
      "UF Rhein -Rheinbrücke Schierstein-/UF K 648 (Achse N` - O) FR Mainz",
    ]) expect(kreuztKeineStrasse(n), n).toBe(false)
  })

  it("schweigt bei Namen, die gar nichts ueber das Gekreuzte sagen", () => {
    for (const n of ["Autobahnkreuz Landstuhl", "AD Bad Neuenahr-Ahrweiler", "Brücke 6709596", "", null])
      expect(kreuztKeineStrasse(n), String(n)).toBe(false)
  })
})

describe("zuordnung — Gewaesserbruecken (T-699)", () => {
  // Max' Fall im Ganzen: die GST-Liste der Autobahn GmbH nennt zu dieser Bruecke weder eine
  // getragene noch eine gekreuzte Strasse. Bis T-699 blieb sie deshalb "unbestimmt".
  it("beweist die Mainbruecke, die gar keine Strassenangabe traegt", () => {
    const b = bauwerk({ maxGewichtT: 40 }, { name: "Mainbrücke Eddersheim" })
    expect(zuordnung(b, ctx, 10)).toBe("bewiesen")
  })

  // Die Gegenprobe, und sie ist die teurere Richtung: nennt das STRUKTURFELD eine brauchbare
  // gekreuzte Strasse, gilt sie und nicht der Name. "Wupper-Talbruecke Oehde" traegt die A1 und
  // kreuzt die L58 — wer die L58 faehrt, faehrt darunter durch.
  it("laesst das Strukturfeld gewinnen, wenn es eine gekreuzte Strasse nennt", () => {
    const b = bauwerk(
      { gekreuzteStrasse: "A 7", maxGewichtT: 40 },
      { name: "Wupper-Talbrücke Oehde" },
    )
    expect(zuordnung(b, ctx, 10)).toBe("widerlegt")
  })

  // Und sie darf nur Bauwerke betreffen. Alles andere liegt AUF der Strasse.
  it("greift nicht bei Hindernissen, die keine Bruecke sind", () => {
    const b = { kategorie: "baustelle", attrs: { maxGewichtT: 40 }, name: "Mainbrücke Eddersheim" }
    expect(zuordnung(b, ctx, 10)).toBe("unbestimmt")
  })
})

// T-699, zweiter Teil. Max: "vlt ne extra flag einbauen welche metrik relevant ist je nach
// strasse eben." Die Feldliste ist aus dem Bestand gezaehlt; dieser Test haelt sie fest.
describe("massgebendeLage — welche Metrik gilt (T-699)", () => {
  // DER FALL, DER IN DER ERSTEN FASSUNG DURCHRUTSCHTE. grundsaetzlicheGstSperre ist mit 3.707
  // Bauwerken das haeufigste Befahren-Feld ueberhaupt, fehlte aber in der Liste. Folge in der
  // Probe: null Funde bekamen die Angabe. Der Datensatz hier ist woertlich aus der Produktion.
  it("erkennt die GST-Sperre der BASt-Bruecken als Befahren-Aussage", () => {
    const b = bauwerk({ getrageneStrasse: "B27", gekreuzteStrasse: "B27", grundsaetzlicheGstSperre: true })
    expect(massgebendeLage(b)).toBe("beim Befahren des Bauwerks")
  })

  it("liest eine Durchfahrtshoehe als Unterqueren-Aussage", () => {
    expect(massgebendeLage(bauwerk({ maxHoeheM: 3.8 }))).toBe("beim Unterqueren des Bauwerks")
  })

  it("schweigt, wenn beides dasteht — dann trennt die Angabe nichts", () => {
    expect(massgebendeLage(bauwerk({ maxHoeheM: 3.8, maxGewichtT: 40 }))).toBe(null)
  })

  it("schweigt ohne Restriktion und bei allem, was kein Bauwerk ist", () => {
    expect(massgebendeLage(bauwerk({ getrageneStrasse: "A7" }))).toBe(null)
    expect(massgebendeLage({ kategorie: "baustelle", attrs: { maxGewichtT: 40 } })).toBe(null)
  })
})

// T-702/T-704, 07.09.2026. Diese fuenf Faelle stammen aus einer adversarischen Pruefung, die an
// zwei frisch gebauten Fixes GENAU DEN FEHLER fand, gegen den die Tickets standen: Bauwerke, die
// von "bewiesen" auf "widerlegt" kippten und deren Fund damit still verschwand.
//
// Beide Ursachen brauchten das ZWEI-STRASSEN-FENSTER, um sichtbar zu werden — an einem
// Autobahnkreuz faehrt die Route beide Strassen. Mit einem Ein-Strassen-Fenster gemessen, blieben
// sie unsichtbar; genau daran scheiterte die erste Gegenprobe.
describe("Zwei-Strassen-Fenster: nichts still verwerfen (T-702/T-704)", () => {
  const zweiStrassen = (a, b) =>
    strassenSpannenBauen(
      [
        { ref: a, punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.5, lng: 9.5 }] },
        { ref: b, punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.5, lng: 9.5 }] },
      ],
      route, cum, null,
    )
  const urteil = (name, attrs, a, b) =>
    zuordnung({ kategorie: "bruecke", name, attrs }, { strassenSpannen: zweiStrassen(a, b) }, 10)

  // Lage E heisst "zugeordnet, aber weder oben noch unten" — die Quelle sagt zur Hoehenlage
  // NICHTS. Liess man das Unten-Feld trotzdem stehen, verwarf es allein, und zwar VOR jeder
  // Namenspruefung. Der Name sagt hier ausdruecklich, dass das Bauwerk die A14 TRAEGT.
  it("verwirft nicht, wenn die Quelle zur Hoehenlage schweigt (Lage E)", () => {
    expect(urteil("Kreuzungsbauwerk A14 über A2/Verteiler parallel zur RFB Dresden", {}, "A14", "A2"))
      .not.toBe("widerlegt")
  })

  // Traegt die fuehrende Nummer im Namen einen Buchstabenzusatz (B87n, A113n), sieht die
  // Namenslesung sie nicht und liefert {oben: null, unten: X}. Das STRUKTURFELD nennt die
  // getragene Strasse aber sehr wohl — die Gegenprobe muss es fragen, nicht nur den Namen.
  it("laesst das Strukturfeld die Namenslesung ueberstimmen, wenn es die getragene Strasse nennt", () => {
    expect(urteil("Brücke über die B87n im Zuge der L 37/",
      { getrageneStrasse: "L 37", gekreuzteStrasse: "B 87" }, "L37", "B87")).toBe("bewiesen")
    expect(urteil("Brücke im Zuge der A 113n über die B 96a/Überbau 1",
      { getrageneStrasse: "A 113", gekreuzteStrasse: "B 96" }, "A113", "B96")).toBe("bewiesen")
  })

  // DIE GEGENPROBE, und sie ist die wichtigere: eine echte Ueberfuehrung ueber unsere Fahrbahn
  // muss weiterhin verschwinden. Beim ersten Anlauf des Strukturfeld-Vorrangs fiel genau das
  // aus — bei kaputtem Feldpaar (oben == unten) trug obenWeit die kaputte Nummer als
  // Schutzschild herein.
  it("verwirft die Ueberfuehrung ueber unsere Fahrbahn weiterhin", () => {
    expect(urteil("BRÜCKE I.Z.WIRTSCHAFTSWEG ÜBER A5/Brückenbauwerk Übf. WW über A5",
      { getrageneStrasse: "A5", gekreuzteStrasse: "A5" }, "A5", "A5")).toBe("widerlegt")
    expect(urteil("GRÜNBRÜCKE/Grünbrücke über die B10", {}, "B10", "B10")).toBe("widerlegt")
  })
})

describe("strasseAusName — Ueberfuehrung (T-676)", () => {
  // Alle Namen woertlich aus dem Produktionsbestand.
  it("liest die Nummer VOR dem Ueberfuehrungswort als gekreuzte Strasse", () => {
    // Der Wirtschaftsweg liegt oben, die A5 unten — wir fahren darunter durch.
    expect(strasseAusName('A5; Üfg WiWeg Marienhof')).toMatchObject({ oben: null, unten: "A5" })
    expect(strasseAusName('A5; Überführung Wirtschaftsweg "Rittmatte"')).toMatchObject({ oben: null, unten: "A5" })
    expect(strasseAusName("A24, ÜF Gemeindestraße von Lehsen nach Ziggelmark/Brücke")).toMatchObject({ oben: null, unten: "A24" })
  })

  it("laesst die Nummer HINTER dem Ueberfuehrungswort die getragene bleiben", () => {
    // Hier traegt das Bauwerk die A2 selbst, die Reihenfolge im Namen sagt es.
    expect(strasseAusName("BW 657, Üf. BAB A 2 ü. Gemeindestr. in km 260,883/")).toMatchObject({ oben: "A2" })
  })

  // T-699. "Gruenbruecke ueber die A 9" sagt dasselbe wie "UEF ueber die A 9", nur ohne das Wort,
  // an dem NAME_UEF haengt — und ohne Nummer vor dem "ueber", an der NAME_UEBER haengt. Beides
  // zusammen liess diese Namen durchfallen. Gemessen: 203 Bauwerke im Bestand, alle von
  // {null,null} auf {null,unten}, KEINE einzige Umkehr von oben nach unten.
  it("liest 'X über <Nummer>' auch ohne Ueberfuehrungswort als gekreuzte Strasse", () => {
    expect(strasseAusName("GRÜNBRÜCKE/Grünbrücke über die B10")).toMatchObject({ oben: null, unten: "B10" })
    expect(strasseAusName("Grünbrücke über die A 9/Brücke")).toMatchObject({ oben: null, unten: "A9" })
    expect(strasseAusName("FUßGÄNGERBRÜCKE ÜBER DIE A 4 ZUM LOBECENTER")).toMatchObject({ unten: "A4" })
    expect(strasseAusName("Radwegbrücke über die BAB A 9/BW 7")).toMatchObject({ unten: "A9" })
  })

  // DIE SICHERUNG. Ohne den Trenner-Schnitt nahm die Zeile die erste Nummer im GANZEN Rest, und
  // der traegt oft eine zweite, ganz andere Angabe. Diese vier drehten die Lage um; jetzt
  // schweigen sie. Gemessen: 26 der urspruenglich 229 Treffer waren genau solche Faelle.
  it("nimmt NICHT die Nummer hinter einem Trenner — die meint etwas anderes", () => {
    // Die L37 TRAEGT die Bruecke, unterquert wird die B87n. Bis T-704 stand hier `unten: null`,
    // weil normRoadRefWeit "B87n" gar nicht lesen konnte — die Zusicherung des Tests war aber
    // immer "NICHT die L37", nicht "gar nichts". Seit dem Buchstabenzusatz nennt die Zeile die
    // wirklich unterquerte Strasse, und das Strukturfeld dieses Bauwerks bestaetigt sie:
    // gekreuzteStrasse = B87, getrageneStrasse = L37.
    expect(strasseAusName("Brücke über die B87n im Zuge der L 37/")).toMatchObject({ unten: "B87" })
    expect(strasseAusName("Brücke über die B87n im Zuge der L 37/").unten).not.toBe("L37")
    // Ueberquert wird ein Bach; die B182 traegt.
    expect(strasseAusName("Brücke über die Tauschke/B 182, BW 7")).toMatchObject({ unten: null })
    expect(strasseAusName("Brücke über die DBAG/B169, OU Senftenberg, Brücke über die DBAG")).toMatchObject({ unten: null })
    expect(strasseAusName('Forstweg über WL "Saale" neben B 240 in km 3,010/')).toMatchObject({ unten: null })
  })

  // Und die zweite Sicherung: steht vorne eine Nummer, ist der Name mehrdeutig. Aus einer
  // mehrdeutigen Angabe darf kein Verwerfen folgen.
  it("schweigt, wenn vor dem 'über' schon eine Nummer steht", () => {
    expect(strasseAusName("Brücke A6 Äste A-T u. G-I / Overfly / über A6")).toMatchObject({ oben: "A6", unten: null })
    expect(strasseAusName("Brücke A3 über Main - Mainbrücke Randersacker/FR Frankfurt")).toMatchObject({ oben: "A3" })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-704: Strassennummern mit Buchstabenzusatz ("A99a", "B 96a", "A4w", "B 178n")
//
// Der Schaden war nicht das Schweigen, sondern was danach kam. normRoadRef gab null, aber
// normStrassenName machte aus "A99a" den Strassen-NAMEN "a99a" — und damit fiel das Hindernis in
// den Namensvergleich fuer benannte Gemeindestrassen. Der widerlegt, sobald die Route an dieser
// Stelle irgendetwas kennt, und "a99a" heisst dort nie so. Der Fund verschwand ohne Vermerk.
// Gemessen am 07.09.2026: 76 aktive Hindernisse mit solcher Ref, 58 davon Baustellen/Sperrungen.
// ─────────────────────────────────────────────────────────────────────────────
describe("Strassennummer mit Buchstabenzusatz (T-704)", () => {
  const aufA7 = { strassenSpannen: spannen, refs: new Set(["A7", "A44"]) }
  const baustelle = (strassenRef) => ({ kategorie: "baustelle", strassenRef, attrs: {} })

  it("liest den Zusatz als Teil der NUMMER, nicht als Strassennamen", () => {
    expect(normRoadRef("A99a")).toBe("A99A")
    expect(normRoadRef("B 96a")).toBe("B96A")
    expect(normRoadRef("B16A")).toBe("B16A")
    expect(normRoadRefWeit("B 31a")).toBe("B31A")
  })

  // DIE MINDESTANFORDERUNG des Tickets: solange normRoadRef null gibt, springt der Namenszweig
  // an und loescht still. Ein Wert — irgendeiner — verhindert das.
  it("laesst eine Baustelle auf der B96a NICHT mehr still verschwinden", () => {
    expect(zuordnung(baustelle("B96A"), aufA7, 10)).not.toBe("widerlegt")
    expect(zuordnung(baustelle("A99a"), aufA7, 10)).not.toBe("widerlegt")
    // Und das Vorab-Sieb darf sie nicht mehr in den Namensvergleich schicken.
    expect(kannWiderlegtWerden(baustelle("B96A"), new Set(["A7"]))).toBe(false)
  })

  // Gemessen: fuer 34 der 51 Hindernisse, bei denen OSM an der Koordinate ueberhaupt eine Ref
  // fuehrt, nennt OSM den Zusatz MIT ("B 96a", "A 64a", "B 31a"). Die Route-Seite faellt also
  // genauso aus, und beide Seiten treffen sich.
  it("trifft sich mit der Route, die dieselbe Strasse faehrt", () => {
    const aufB96a = strassenSpannenBauen(
      [{ ref: normRoadRef("B 96a"), punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] }],
      route, cum, null,
    )
    expect(zuordnung(baustelle("B96A"), { strassenSpannen: aufB96a }, 10)).toBe("bewiesen")
  })

  // Die Gegenrichtung, und sie ist der Grund fuer die Entscheidung "eigene Strasse": die B96a in
  // Berlin ist nicht die B96, sie liegt im naechsten gemessenen Fall 3,1 km entfernt. Wuerde der
  // Zusatz wegfallen, erklaerte eine B96-Route eine Baustelle auf der B96a zu ihrer eigenen.
  it("setzt die Zweigstrecke NICHT mit der Grundnummer gleich", () => {
    const aufB96 = strassenSpannenBauen(
      [{ ref: "B96", punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] }],
      route, cum, null,
    )
    expect(zuordnung(baustelle("B96A"), { strassenSpannen: aufB96 }, 10)).not.toBe("bewiesen")
  })

  // N/S/O/W sind KEINE eigenen Strassen, und das ist gemessen: fuer alle 10 Hindernisse mit
  // solchem Zusatz, bei denen OSM eine Ref fuehrt, nennt OSM ausnahmslos die GRUNDNUMMER
  // ("A4w"/"A4o" -> "A 4" am Tunnel Koenigshainer Berge, "B178N" -> "B 178", "B271N" -> "B 271",
  // "A14N" -> "A 14"). Bliebe der Zusatz stehen, wuerden genau die vier BASt-Bruecken auf der
  // Strecke, die sie traegt, per Umkehrschluss verworfen — eine GST-Sperre auf unserer eigenen
  // Fahrbahn, still geloescht.
  it("wirft die Richtungs- und Planungsbuchstaben N/S/O/W weg", () => {
    expect(normRoadRef("A4w")).toBe("A4")
    expect(normRoadRef("A4O")).toBe("A4")
    expect(normRoadRef("B178N")).toBe("B178")
    expect(normRoadRefWeit("B 178n")).toBe("B178")
    expect(normRoadRefWeit("A 14N")).toBe("A14")
    expect(normRoadRefWeit("St2020n")).toBe("ST2020")
  })

  it("faehrt die A4 auch dann, wenn die Quelle sie A4w nennt", () => {
    const aufA4 = strassenSpannenBauen(
      [{ ref: "A4", punkte: [{ lat: 51.0, lng: 9.5 }, { lat: 51.3, lng: 9.5 }] }],
      route, cum, null,
    )
    expect(zuordnung(baustelle("A4w"), { strassenSpannen: aufA4 }, 10)).toBe("bewiesen")
  })

  // Die Sicherungen von T-653/T-676/T-699 muessen stehen bleiben. Das Landkreiskuerzel steht VOR
  // der Nummer und braucht einen Trenner, der Zusatz steht DAHINTER und duldet keinen — sie
  // koennen sich nicht in die Quere kommen.
  it("laesst das Landkreiskuerzel unberuehrt", () => {
    expect(normRoadRefWeit("K BA 10")).toBe("KBA10")
    expect(normRoadRefWeit("K-NES 3")).toBe("KNES3")
    expect(normRoadRefWeit("K AN 7")).toBe("KAN7")
    expect(normRoadRefWeit("Stein 2")).toBeNull()
    expect(normRoadRefWeit("BSW 3")).toBeNull()
  })

  // GENAU EIN Buchstabe, DIREKT angehaengt. Mit Leerzeichen davor las der Ausdruck "Üf. A 9 u.
  // Gemeindestr." als "A9U", mit zwei Buchstaben "B12BL" als eigene Strasse.
  it("nimmt weder abgesetzte noch zweibuchstabige Endungen", () => {
    expect(normRoadRefWeit("Üf. A 9 u. Gemeindestr.")).toBe("A9")
    expect(normRoadRef("B 16 A")).toBe("B16")
    expect(normRoadRef("B12BL")).toBeNull()
    expect(normRoadRef("Münsterstraße")).toBeNull()
  })
})

// Die Nebenwirkung der Erweiterung, und ihre zwei Wachen. Beide sind noetig, weil normRoadRefWeit
// jetzt Nummern findet, wo vorher keine waren — und an diesen Stellen ist die gefundene Nummer
// die GETRAGENE, nicht die gekreuzte. Ohne die Wachen waeren drei BASt-Bruecken mit GST-Sperre
// auf einer B6-Route still verschwunden.
describe("strasseAusName — Wachen gegen die falsche Richtung (T-704)", () => {
  it("nimmt keine Nummer als gekreuzt, die hinter einer Bahnstrecke steht", () => {
    // Strukturfeld dieser drei Bauwerke: getrageneStrasse = B6, gekreuzteStrasse LEER. Die B6n
    // TRAEGT sie, ueberquert wird die Bahn.
    expect(strasseAusName("Brücke über die DBAG B 6N BW 98A/RF Köthen")).toMatchObject({ oben: null, unten: null })
    expect(strasseAusName("Brücke über die DB AG B 6N BW 97A/RF Köthen")).toMatchObject({ unten: null })
  })

  // ABER NUR DORT. Steht die getragene Strasse vorne, ist die Bahn das erste von mehreren
  // ueberquerten Dingen — und die Strasse dahinter zaehlt. Vom Strukturfeld bestaetigt:
  // gekreuzteStrasse = K6303.
  it("laesst die gekreuzte Strasse stehen, wenn die getragene bekannt ist", () => {
    expect(strasseAusName("Brücke im Zuge der A 10 über DB AG und K 6303/Überbau 2, rechte Richtungsfahrbahn"))
      .toMatchObject({ oben: "A10", unten: "K6303" })
  })

  // Der Trenner-Schnitt aus T-699 gilt jetzt auch im Zweig MIT Nummer vor dem "ueber". Alle drei
  // Namen woertlich aus dem Bestand, alle drei mit leerem Strukturfeld gekreuzteStrasse.
  it("liest hinter dem Trenner auch dann nichts, wenn die getragene Strasse bekannt ist", () => {
    expect(strasseAusName("Brücke A70 über Main - Mainbrücke Oberndorf/FR A7-B26n")).toMatchObject({ oben: "A70", unten: null })
    expect(strasseAusName("Del21 / A28 über Dauelsberger Weg, km 117,676/Rifa A1, westliches TBW")).toMatchObject({ oben: "A28", unten: null })
    expect(strasseAusName("Brücke B301 über S-Bahn (S1)")).toMatchObject({ oben: "B301", unten: null })
    // Und die B6n ist dieselbe Fahrbahn wie die A36, die die Bruecke traegt — keine gekreuzte.
    expect(strasseAusName("Brücke i.Z.d. A 36 über einen WW u.Flutgelände/Brücke Bw 57.1 A i. Z. d. B6n zur BAB14"))
      .toMatchObject({ oben: "A36", unten: null })
  })
})
