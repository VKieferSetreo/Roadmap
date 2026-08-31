// Die zwei Rechnungen der Ordner-Navigation (T-651).
//
// Warum hier und nicht neben dem Frontend-Code: server/vitest.config.js ist die einzige
// eingerichtete Testumgebung im Projekt. Vitest uebersetzt die .ts-Datei selbst, und weil
// ordner.ts keinen @-Alias importiert, laeuft sie hier ohne weitere Konfiguration.

import { describe, it, expect } from "vitest"
import { anzahlTief, gueltigerPfad } from "../../src/lib/ordner.ts"

// CK → Prysmian → Hamm, plus ein leerer Nachbarordner. Entspricht dem echten Bestand.
const ordner = [
  { id: "ck", parentId: null },
  { id: "prysmian", parentId: "ck" },
  { id: "hamm", parentId: "prysmian" },
  { id: "leer", parentId: null },
]
const projekte = [
  { folderId: "ck" },
  { folderId: "ck" },
  { folderId: "prysmian" },
  { folderId: "hamm" },
  { folderId: null }, // liegt lose, gehoert in keinen Ordner
]

describe("anzahlTief", () => {
  it("zaehlt die Unterordner mit, sonst saehe CK leerer aus als es ist", () => {
    expect(anzahlTief("ck", ordner, projekte)).toBe(4)
    expect(anzahlTief("prysmian", ordner, projekte)).toBe(2)
    expect(anzahlTief("hamm", ordner, projekte)).toBe(1)
  })

  it("ist 0 bei einem leeren Ordner und bei einem, den es nicht gibt", () => {
    expect(anzahlTief("leer", ordner, projekte)).toBe(0)
    expect(anzahlTief("gibtsnicht", ordner, projekte)).toBe(0)
  })

  it("zaehlt lose Projekte nicht mit", () => {
    const summe = ordner.filter((f) => f.parentId == null).reduce((n, f) => n + anzahlTief(f.id, ordner, projekte), 0)
    expect(summe).toBe(4) // die 5 Projekte minus das lose
  })

  it("haengt sich bei einem Zyklus nicht auf", () => {
    const kreis = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]
    expect(anzahlTief("a", kreis, [{ folderId: "a" }, { folderId: "b" }])).toBe(2)
  })
})

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
