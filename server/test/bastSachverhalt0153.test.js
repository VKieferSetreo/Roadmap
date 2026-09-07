// BASt-Brücken (0153): die Lage aus dem Sachverhalt-Feld lesen, nicht nur die Nummer (T-702).
//
// Gemessen am 07.09.2026 an allen 3.294 Datensätzen mit sperrung_sv='ja'. Alle Feldwerte in
// diesem Test sind echte Werte aus dem Bestand, keine erfundenen.
//
// Geprüft wird das, was teuer ist, wenn es kippt:
//   1. Lage E ist KEINE getragene Straße (116 Bauwerke) — sonst behauptet die Quelle für eine
//      Radwegbrücke „du fährst darüber".
//   2. Die S-Klasse (Staatsstraße, "S 8") muss ankommen und wie in normRoadRef zu "ST8" werden
//      (28 Bauwerke) — sonst verliert das Bauwerk seine getragene Straße und wird zu Unrecht
//      verworfen.
//   3. Liegt unten nur ein AST derselben Straße, ist das keine gekreuzte Straße (66 Bauwerke).
//   4. Die Gegenrichtung (Ast oben, Hauptfahrbahn unten) bleibt stumm — sie zu lösen hieße
//      löschen, und dafür reichen die Daten nicht.
import { afterEach, describe, expect, it, vi } from "vitest"
import { bastBrueckenConnector as conn, refAus } from "../src/connectors/0153_bast_bruecken.js"
import { zuordnung } from "../src/engine/index.js"

/** Ein Feature bauen — nur die Felder, die der Connector anfasst. */
const feat = (bwnr, bauwerksname, oben, unten) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [9.5, 51.0] },
  properties: {
    id_nr: `${bwnr}-0`, bwnr, tbwnr: 0, bauwerksname,
    trag_l_idx: "I", ort: "Testort", bl: "TT",
    hoechst_sachverhalt_oben: oben, hoechst_sachverhalt_unten: unten,
  },
})

async function lade(features) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true, headers: { get: () => "application/json" },
    json: async () => ({ features }),
  })
  const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
  return new Map(obstacles.map((o) => [o.name, o]))
}

/** Die Route führt an dieser Stelle über genau eine Straße. */
const ctxAuf = (ref) => ({
  strassenSpannen: [{ vonKm: 0, bisKm: 100, ref, name: null }],
  refs: new Set([ref]),
})

afterEach(() => vi.restoreAllMocks())

describe("0153 refAus — die Lage entscheidet", () => {
  it("liest O und U, aber NICHT E als getragene Straße", () => {
    expect(refAus("*O:  A 1 ", "O")).toBe("A1")
    expect(refAus(" O:  K 11 ", "O")).toBe("K11")
    expect(refAus(" U:  L 3071 ", "U")).toBe("L3071")
    // 116 Bauwerke im Bestand; jast_lage bestätigt das E in 115 davon.
    expect(refAus("*E: B 188 ", "O")).toBeUndefined()
    expect(refAus("*E: A 100 ", "O")).toBeUndefined()
    // Ein U-Feld ist keine getragene Straße und umgekehrt.
    expect(refAus("*U: A 14 ", "O")).toBeUndefined()
    expect(refAus("*O: A 14 ", "U")).toBeUndefined()
  })

  it("erkennt die Staatsstraße 'S 8' und bildet sie wie normRoadRef auf ST8 ab", () => {
    expect(refAus("O: S 8 ", "O")).toBe("ST8")
    expect(refAus("U: S 2239 ", "U")).toBe("ST2239")
    expect(refAus("*O: St 2580 ", "O")).toBe("ST2580")
  })

  it("schweigt, wo keine klassifizierte Nummer steht", () => {
    for (const v of ["O: G+R", "O: WiWeg.", "U: Forstw.", "U: Sonstige Straße", "", null]) {
      expect(refAus(v, "O")).toBeUndefined()
      expect(refAus(v, "U")).toBeUndefined()
    }
  })
})

describe("0153 Feldzuordnung gegen echte Bestandswerte", () => {
  it("Lage E liefert keine getragene Straße, behält aber das Anzeige-Label", async () => {
    const o = (await lade([
      feat(1, "Radwegholzbrücke über den Bullengraben", "*E: B 188 ", null),
    ])).get("Radwegholzbrücke über den Bullengraben")
    expect(o.attrs.getrageneStrasse).toBeUndefined()
    expect(o.attrs.gekreuzteStrasse).toBeUndefined()
    // Verortung darf bleiben: für Brücken zieht die Engine aus strassenRef kein Urteil.
    expect(o.strassenRef).toBe("B188")
  })

  it("die Radwegbrücke gilt auf ihrer eigenen B-Straße nicht mehr als bewiesen befahren", async () => {
    const o = (await lade([
      feat(1, "Radwegholzbrücke über den Bullengraben", "*E: B 188 ", null),
    ])).get("Radwegholzbrücke über den Bullengraben")
    // Vorher: getrageneStrasse = B188 → „bewiesen, du fährst darüber". Das war unbelegt.
    expect(zuordnung(o, ctxAuf("B188"), 50)).toBe("unbestimmt")
  })

  it("holt die Staatsstraße als getragene Straße zurück (sonst wird der Fund verworfen)", async () => {
    const o = (await lade([feat(2, "A14 BW41Ü4a", "O: S 8 ", "*U: A 14 ")])).get("A14 BW41Ü4a")
    expect(o.attrs.getrageneStrasse).toBe("ST8")
    expect(o.attrs.gekreuzteStrasse).toBe("A14")
    // Auf der ST8 fahren wir über das Bauwerk. Ohne die S-Klasse stand dort getragene=undefined,
    // die Engine las die A14 aus dem Namen und verwarf den Fund.
    expect(zuordnung(o, ctxAuf("ST8"), 50)).toBe("bewiesen")
    // Gegenprobe: unter dem Bauwerk (A14) bleibt es richtigerweise verworfen.
    expect(zuordnung(o, ctxAuf("A14"), 50)).toBe("widerlegt")
  })

  it("ein Ast DERSELBEN Straße unten ist keine gekreuzte Straße", async () => {
    const name = 'A 1 / Äste A 1 (BW 530) [AS Heiligenhafen Mitte]/Rifa Puttgarden - Hamburg'
    const o = (await lade([feat(3, name, "*O: A 1 ", "U: A 1 (Ast) ")])).get(name)
    expect(o.attrs.getrageneStrasse).toBe("A1")
    expect(o.attrs.gekreuzteStrasse).toBeUndefined()
    // Vorher standen zweimal "A1" da, die Engine hielt die Angabe für kaputt und urteilte gar
    // nicht. Der Name sagt es ausdrücklich: das Bauwerk trägt die A1 über die A1-Äste.
    expect(zuordnung(o, ctxAuf("A1"), 50)).toBe("bewiesen")
  })

  it("ein Ast einer ANDEREN Straße unten bleibt erhalten (sonst gehen richtige Verwerfungen verloren)", async () => {
    const o = (await lade([
      feat(4, "Paul-Bäumer-Brücke ( UFU )", "O: G+R", "*U: B 433 (Ast) "),
    ])).get("Paul-Bäumer-Brücke ( UFU )")
    expect(o.attrs.getrageneStrasse).toBeUndefined()
    expect(o.attrs.gekreuzteStrasse).toBe("B433")
    // Oben liegt ein Geh-/Radweg, unten die B433: auf der B433 fahren wir darunter durch.
    expect(zuordnung(o, ctxAuf("B433"), 50)).toBe("widerlegt")
  })

  it("Ast OBEN mit Hauptfahrbahn unten bleibt stumm — Freisprechen darf nur, wer sicher ist", async () => {
    const o = (await lade([
      feat(5, "UEF der Zufahrt zur T&R KS-Ost von Norden", "O: A 7 (Ast) ", "*U: A 7 "),
    ])).get("UEF der Zufahrt zur T&R KS-Ost von Norden")
    // Beide Felder nennen die A7 — die Engine ignoriert das Paar. Das ist gewollt: die
    // Gegenrichtung aufzulösen hieße 33 Funde zu löschen, gestützt auf eine unbelegte Annahme.
    expect(o.attrs.getrageneStrasse).toBe("A7")
    expect(o.attrs.gekreuzteStrasse).toBe("A7")
    expect(zuordnung(o, ctxAuf("A7"), 50)).toBe("unbestimmt")
  })
})
