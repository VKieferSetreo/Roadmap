// Die Pfadrechnung der Ordner-Navigation (T-651).
//
// Warum hier und nicht neben dem Frontend-Code: server/vitest.config.js ist die einzige
// eingerichtete Testumgebung im Projekt. Vitest uebersetzt die .ts-Datei selbst, und weil
// ordner.ts keinen @-Alias importiert, laeuft sie hier ohne weitere Konfiguration.

import { describe, it, expect } from "vitest"
import { gueltigerPfad } from "../../src/lib/ordner.ts"

// CK → Prysmian → Hamm, plus ein Nachbarordner. Entspricht dem echten Bestand.
const ordner = [
  { id: "ck", parentId: null },
  { id: "prysmian", parentId: "ck" },
  { id: "hamm", parentId: "prysmian" },
  { id: "leer", parentId: null },
]

describe("gueltigerPfad", () => {
  it("laesst einen heilen Pfad unveraendert", () => {
    expect(gueltigerPfad(["ck", "prysmian", "hamm"], ordner)).toEqual(["ck", "prysmian", "hamm"])
  })

  it("kuerzt bis zum letzten Glied, das es noch gibt", () => {
    const ohnePrysmian = ordner.filter((f) => f.id !== "prysmian")
    expect(gueltigerPfad(["ck", "prysmian", "hamm"], ohnePrysmian)).toEqual(["ck"])
  })

  // Das ist der Fall, den eine reine Existenzpruefung durchgehen liesse: Hamm gibt es noch,
  // haengt aber nicht mehr unter Prysmian. Der Pfad waere dann eine Luege.
  it("kuerzt auch, wenn ein Ordner noch existiert, aber woanders haengt", () => {
    const verschoben = ordner.map((f) => (f.id === "hamm" ? { ...f, parentId: "leer" } : f))
    expect(gueltigerPfad(["ck", "prysmian", "hamm"], verschoben)).toEqual(["ck", "prysmian"])
  })

  it("verwirft ein erstes Glied, das kein Wurzelordner ist", () => {
    expect(gueltigerPfad(["prysmian"], ordner)).toEqual([])
  })

  it("ist bei leerem Pfad leer", () => {
    expect(gueltigerPfad([], ordner)).toEqual([])
  })
})
