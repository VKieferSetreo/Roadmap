// Ueberfuehrungen: was seit T-653 verworfen wird und was NICHT mehr.
//
// Bis T-653 entschied isCrossingStructure() anhand einer GLOBALEN Liste aller Strassen der Route,
// plus einer Namensheuristik als Rueckfall. Beides ist ersetzt:
//   - Die Liste ist ortsbezogen geworden (zuordnung() fragt, was wir AN DIESER STELLE fahren).
//   - Die Namensheuristik loescht nicht mehr. Gemessen ueber 23 Projekte und 4.668 Korridor-
//     Treffer erzeugte sie 0 richtige und 10 falsche Verwerfungen, Praezision 0.
//
// Diese Datei haelt die alten Faelle fest und sagt bei jedem, wie er heute ausgeht. Sie ist damit
// auch die Dokumentation der Verhaltensaenderung: was frueher still verschwand, steht jetzt als
// "unbestimmt" da.

import { describe, expect, it } from "vitest"
import { normRoadRef } from "../src/external/osrm.js"
import { zuordnung } from "../src/engine/index.js"

/** Fahrbahn, auf der die Route an dieser Stelle laeuft. Ein Wert genuegt: die Faelle unten
 *  spielen alle an EINEM Punkt, und genau darum geht es bei der Ortsbezogenheit. */
const hier = (...xs) => ({ strassenSpannen: [], refs: new Set(xs) })
const ob = (name, extra = {}) => ({ kategorie: "bruecke", name, strassenRef: null, geom: null, attrs: {}, ...extra })
const G = (s) => ({ attrs: { getrageneStrasse: s } })
const urteil = (o, ctx) => zuordnung(o, ctx, 10)

describe("normRoadRef", () => {
  it("normalisiert Straßennummern", () => {
    expect(normRoadRef("A 1")).toBe("A1")
    expect(normRoadRef("K 142")).toBe("K142")
    expect(normRoadRef("St 2580")).toBe("ST2580")
    expect(normRoadRef("Münsterstraße")).toBeNull()
  })
})

describe("getragene/gekreuzte Straße bleibt autoritativ", () => {
  it("trägt eine ANDERE Straße über unsere Fahrbahn → Überführung → raus", () => {
    expect(urteil(ob("K 47 [Kr. OH] / A 1", { attrs: { getrageneStrasse: "K47", gekreuzteStrasse: "A1" } }), hier("A1"))).toBe("widerlegt")
    expect(urteil(ob("Üf L815", { attrs: { getrageneStrasse: "L815", gekreuzteStrasse: "A28" } }), hier("A28"))).toBe("widerlegt")
  })

  it("nennt nur die gekreuzte Straße, und die fahren wir → raus", () => {
    expect(urteil(ob("Forstweg \"Kalteiche\" / A45", { attrs: { gekreuzteStrasse: "A45" } }), hier("A45"))).toBe("widerlegt")
  })

  it("trägt UNSERE Straße → wir fahren drüber → bleibt", () => {
    expect(urteil(ob("UF L3071", { attrs: { getrageneStrasse: "A5", gekreuzteStrasse: "L3071" } }), hier("A5"))).toBe("bewiesen")
    expect(urteil(ob("UF Lumda", G("A5")), hier("A5"))).toBe("bewiesen")
    expect(urteil(ob("A 1 / Wi-Weg (BW 2.02)", G("A1")), hier("A1"))).toBe("bewiesen")
  })

  // NEU seit T-653: die getragene Straße allein, ohne dass wir sie hier fahren, beweist nichts.
  // Vorher galt "trägt eine routenfremde Straße → raus" — das verwarf auf Verdacht.
  it("verwirft NICHT mehr allein deshalb, weil die getragene Straße fremd ist", () => {
    expect(urteil(ob("Üf K142", G("K142")), hier("A1"))).toBe("unbestimmt")
  })
})

// Diese Fälle wurden früher über den Namen verworfen. Sie bleiben jetzt stehen und tragen den
// Vermerk "Zuordnung nicht nachweisbar". Der Grund steht oben: die Heuristik lag messbar daneben,
// unter anderem bei "Überholspur", "Überleitung zur A3" und "zwischen B85 und K…".
describe("Namensheuristik verwirft nicht mehr", () => {
  it("lässt eindeutig klingende Überführungen als unbestimmt stehen", () => {
    expect(urteil(ob("BW 138 - Üf K142 über A1"), hier("A1"))).toBe("unbestimmt")
    expect(urteil(ob("Brücke St 2040 über A6"), hier("A6"))).toBe("unbestimmt")
  })

  // Der Fall, an dem die alte GLOBALE Liste scheiterte: eine Route, die A2 UND A7 fährt, hielt
  // "A 7 über A 2" für befahren, egal an welchem Kilometer die Brücke lag.
  it("entscheidet ortsbezogen statt über die ganze Route", () => {
    const nurA2 = { attrs: { getrageneStrasse: "A7", gekreuzteStrasse: "A2" } }
    expect(urteil(ob("A 7 über A 2", nurA2), hier("A2"))).toBe("widerlegt") // hier fahren wir unten
    expect(urteil(ob("A 7 über A 2", nurA2), hier("A7"))).toBe("bewiesen") // hier oben
  })

  it("hält harmlose Namen weiterhin für unbestimmt statt sie zu verwerfen", () => {
    expect(urteil(ob("UF Wirtschaftsweg"), hier("A5"))).toBe("unbestimmt")
    // Nennt der Name eine Strassennummer, schweigt die T-699-Regel — genau dann kann die Nummer
    // die unterquerte sein. Hier ist es die A 7, und "Bach" allein ist kein Gewaesser-Muster.
    expect(urteil(ob("BW 3052 - Brücke ü.d. Wl Ortshäuser Bach i.Z.d. A 7"), hier("A7"))).toBe("unbestimmt")
  })

  // T-699 (Max, 06.09.2026: "bei sowas wie Mainbruecke weiss man das ja"). "Talbruecke Haseltal"
  // stand hier frueher als "unbestimmt" — nicht weil das richtig gewesen waere, sondern weil die
  // Engine ueber ein Tal nichts sagen konnte. Ueber einem Tal liegt keine Strasse, also faehrt man
  // darueber. Der Zweck dieses Blocks bleibt unberuehrt: es wird weiterhin NICHTS verworfen, die
  // Regel hebt nur "unbestimmt" auf "bewiesen".
  it("beweist Bauwerke, deren Name ein Tal oder Gewässer als das Gekreuzte nennt", () => {
    expect(urteil(ob("Talbrücke Haseltal"), hier("A3"))).toBe("bewiesen")
    expect(urteil(ob("Mainbrücke Eddersheim"), hier("A3"))).toBe("bewiesen")
  })
})

describe("Schutzregeln", () => {
  it("urteilt nie ohne Auskunft über die eigene Strecke", () => {
    const o = ob("Üf K142 über A1", { attrs: { getrageneStrasse: "K47", gekreuzteStrasse: "A1" } })
    expect(urteil(o, { strassenSpannen: [], refs: null })).toBe("unbestimmt")
    expect(urteil(o, { strassenSpannen: [], refs: new Set() })).toBe("unbestimmt")
  })

  // Die Geometrie-Bedingung von früher ist ersatzlos weg: sie betraf gemessen 2 von 1.384
  // Bauwerken und hinderte den autoritativen Pfad nur daran, dort zu arbeiten, wo er richtig liegt.
  it("gilt jetzt auch für Bauwerke MIT eigener Geometrie", () => {
    const o = ob("Üf K142 über A1", {
      attrs: { getrageneStrasse: "K47", gekreuzteStrasse: "A1" },
      geom: { type: "LineString", coordinates: [[9, 51], [9.001, 51.001]] },
    })
    expect(urteil(o, hier("A1"))).toBe("widerlegt")
  })

  it("fasst Hindernisse auf der Fahrbahn nicht mit der Bauwerksregel an", () => {
    const baustelle = ob("Baustelle A1", { kategorie: "baustelle", attrs: { getrageneStrasse: "K47", gekreuzteStrasse: "A1" } })
    expect(urteil(baustelle, hier("A1"))).toBe("widerlegt") // dieselbe Regel, wenn die Angaben da sind
    const ohneAngabe = ob("Baustelle", { kategorie: "baustelle", strassenRef: "A1" })
    expect(urteil(ohneAngabe, hier("A1"))).toBe("bewiesen") // eigene Ref zählt hier sehr wohl
  })
})
