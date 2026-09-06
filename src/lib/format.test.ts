// Erster Frontend-Test des Projekts (T-733) — bewusst an der kleinsten Stelle, damit er die
// Einrichtung beweist, bevor die schwereren Komponententests darauf aufbauen.
//
// fundeText ist der Fall aus T-688: im Export-Dialog stand "1 Funde im Export", obwohl die
// Hilfsfunktion genau dafür gebaut und zwei Zeilen höher schon benutzt wurde. Ein Ein-Zeilen-Test
// hätte das gehalten.

import { describe, it, expect } from "vitest"
import { fundeText } from "./format"

describe("fundeText", () => {
  it("setzt den Singular bei genau einem Fund", () => {
    expect(fundeText(1)).toBe("1 Fund")
  })

  it("setzt den Plural bei allem anderen — auch bei null", () => {
    expect(fundeText(0)).toBe("0 Funde")
    expect(fundeText(2)).toBe("2 Funde")
    expect(fundeText(3366)).toBe("3366 Funde")
  })
})
