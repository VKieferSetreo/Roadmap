import { describe, it, expect } from "vitest"

// Die Ramp liegt im Frontend (src/lib/branding.ts), hat aber keine eigene Test-Einrichtung.
// Der Check haengt deshalb an der Server-Suite: reine Rechenlogik, kein DOM noetig.
import { primaryRampFromHex } from "../../src/lib/branding.ts"

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const helligkeit = (kanaele) => kanaele.split(" ").reduce((a, v) => a + Number(v), 0)

describe("primaryRampFromHex", () => {
  it("500 ist exakt die gewaehlte Farbe", () => {
    expect(primaryRampFromHex("#1b5239")[500]).toBe("27 82 57")
  })

  // Der eigentliche Fehler: bei L=21 % lagen 800/900/950 nach hartem Klemmen alle auf der
  // Untergrenze — drei optisch identische Stufen fuer jeden Mandanten mit dunklem Akzent.
  it("dunkle Akzentfarbe (#1b5239, L=21%) liefert 11 unterscheidbare Stufen", () => {
    const ramp = primaryRampFromHex("#1b5239")
    const werte = STOPS.map((s) => ramp[s])
    expect(new Set(werte).size).toBe(STOPS.length)
  })

  it.each(["#1b5239", "#01584f", "#0f766e", "#111111", "#3b82f6"])(
    "%s: Helligkeit faellt streng monoton von 50 nach 950",
    (hex) => {
      const ramp = primaryRampFromHex(hex)
      const werte = STOPS.map((s) => helligkeit(ramp[s]))
      for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThan(werte[i - 1])
    },
  )

  // Bekannte Grenze: ist die Akzentfarbe selbst schon fast weiss (L>=97), gibt es ueber ihr
  // keinen Platz mehr — die hellen Stufen fallen zusammen. Physik, kein Rechenfehler; als
  // Akzent (Buttonfarbe, weisse Schrift darauf) ist so ein Wert ohnehin unbrauchbar.
  // Die dunkle Haelfte, die die Bedienoberflaeche wirklich braucht, bleibt gestuft.
  it("fast weisser Akzent: dunkle Haelfte bleibt unterscheidbar", () => {
    const ramp = primaryRampFromHex("#f0f9ff")
    const dunkel = [500, 600, 700, 800, 900, 950].map((s) => ramp[s])
    expect(new Set(dunkel).size).toBe(dunkel.length)
    // Die hellen Stufen liegen erwartungsgemaess praktisch aufeinander (kein Platz nach oben).
    expect(helligkeit(ramp[50]) - helligkeit(ramp[400])).toBeLessThan(10)
  })
})
