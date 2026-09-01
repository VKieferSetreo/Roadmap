// Das KI-Gate vor dem Schreiben (T-660).
//
// Die wichtigste Zusage ist nicht "es reichert an", sondern "es verliert nichts". Ein Gate, das
// bei einer Stoerung des Anbieters Datenpunkte verwirft, waere gefaehrlicher als ein roher Punkt:
// eine fehlende Baustelle merkt niemand, eine unvollstaendige sieht man an.

import { describe, it, expect, vi } from "vitest"
import { durchsGate, alsZeile } from "../src/anreicherung/gate.js"
import { gateKonfig } from "../src/anreicherung/gateKonfig.js"
import { quelltextVon } from "../src/anreicherung/lauf.js"

const punkt = (extra = {}) => ({
  externeId: "e1", kategorie: "baustelle", name: "Teststraße 1",
  beschreibung: "Vollsperrung wegen Bauarbeiten", attrs: {},
  strassenRef: "B12", gueltigVon: "2026-09-01", gueltigBis: "2026-09-30",
  quelle: { name: "Testquelle" }, ...extra,
})

describe("durchsGate — anreichern, bevor geschrieben wird", () => {
  it("füllt attrs aus dem, was das Modell belegen kann", async () => {
    const p = [punkt()]
    const r = await durchsGate(p, {
      modell: "t", gleichzeitig: 1,
      rufeModell: async () => JSON.stringify({ angaben: [
        { feld: "vollsperrung", wert: "ja", beleg: "Vollsperrung wegen Bauarbeiten" },
      ] }),
    })
    expect(p[0].attrs.vollsperrung).toBe(true)
    expect(p[0].kiAufbereitet).toBe(true)
    expect(r.gefunden).toBe(1)
    expect(r.belege[0]).toMatchObject({ externeId: "e1", feld: "vollsperrung" })
  })

  it("überschreibt nicht, was die Quelle selbst meldet", async () => {
    const p = [punkt({ attrs: { vollsperrung: false } })]
    await durchsGate(p, {
      modell: "t", gleichzeitig: 1,
      rufeModell: async () => JSON.stringify({ angaben: [
        { feld: "vollsperrung", wert: "ja", beleg: "Vollsperrung wegen Bauarbeiten" },
      ] }),
    })
    expect(p[0].attrs.vollsperrung).toBe(false)
  })

  // Der Kern: das Gate darf nie zum Datenverlust führen.
  it("gibt die Punkte auch dann zurück, wenn das Modell ausfällt", async () => {
    for (const kaputt of [
      async () => { throw new Error("HTTP 429") },
      async () => null,
      async () => "kein JSON",
    ]) {
      const p = [punkt(), punkt({ externeId: "e2" })]
      const r = await durchsGate(p, { modell: "t", rufeModell: kaputt, gleichzeitig: 1 })
      expect(r.punkte).toHaveLength(2)
      expect(r.gefunden).toBe(0)
      expect(p[0].attrs).toEqual({})
    }
  })

  // Ein Import darf nie haengen: ist das Budget aufgebraucht, gehen die restlichen Punkte roh
  // durch, und der Nachlauf holt sie.
  it("bricht nach dem Zeitbudget ab, ohne Punkte zu verlieren", async () => {
    const p = Array.from({ length: 20 }, (_, i) => punkt({ externeId: `e${i}` }))
    const langsam = () => new Promise((r) => setTimeout(() => r('{"angaben": []}'), 60))
    const r = await durchsGate(p, { modell: "t", rufeModell: langsam, gleichzeitig: 1, budgetMs: 120 })
    expect(r.punkte).toHaveLength(20)
  })

  it("läuft ohne Modellzugang einfach durch", async () => {
    const p = [punkt()]
    const r = await durchsGate(p, { modell: "t", rufeModell: null })
    expect(r.punkte).toHaveLength(1)
    expect(r.gesehen).toBe(0)
  })

  // Bremse gegen den Fall, dass eine Quelle einmal ihren ganzen Bestand als "neu" meldet.
  it("verarbeitet höchstens `grenze` Punkte, gibt aber alle zurück", async () => {
    const p = Array.from({ length: 10 }, (_, i) => punkt({ externeId: `e${i}` }))
    const rufe = vi.fn().mockResolvedValue('{"angaben": []}')
    const r = await durchsGate(p, { modell: "t", rufeModell: rufe, grenze: 3, gleichzeitig: 1 })
    expect(r.punkte).toHaveLength(10)
    expect(r.gesehen).toBe(3)
  })
})

describe("alsZeile — der Quelltext muss derselbe sein wie beim Bestandslauf", () => {
  // Ein Connector-Objekt heisst strassenRef, eine Datenbankzeile strassen_ref. Ginge die
  // Umsetzung schief, entstuende ein anderer Quelltext, der quelle_hash passte nicht, und die
  // Ableitung waere veraltet, kaum dass sie geschrieben ist.
  it("setzt die Feldnamen so um, dass derselbe Text entsteht", () => {
    const ausGate = quelltextVon(alsZeile(punkt()))
    const ausDb = quelltextVon({
      kategorie: "baustelle", name: "Teststraße 1", beschreibung: "Vollsperrung wegen Bauarbeiten",
      strassen_ref: "B12", gueltig_von: "2026-09-01", gueltig_bis: "2026-09-30",
      attrs: {}, quelle: { name: "Testquelle" },
    })
    expect(ausGate).toBe(ausDb)
  })
})

describe("gateKonfig — eine Stelle entscheidet", () => {
  it("bleibt aus, wenn kein Schlüssel da ist", () => {
    expect(gateKonfig({ env: {} })).toBeNull()
  })

  it("lässt sich ausdrücklich abschalten", () => {
    expect(gateKonfig({ env: { ANREICHERUNG_GATE: "aus", OPENROUTER_API_KEY: "x" } })).toBeNull()
  })

  it("nimmt im Betrieb OpenRouter, nicht die Workstation", () => {
    const k = gateKonfig({ env: { OPENROUTER_API_KEY: "x" } })
    expect(k).toBeTruthy()
    expect(k.rufeModell).toBeTypeOf("function")
  })

  // Einstufig, nicht dreistufig wie der Bestandslauf: an diesem Aufruf haengt ein Import, der 66
  // Quellen nacheinander abarbeitet, und die dreifache Zeit liess das Aktualisieren stocken.
  it("laeuft einstufig und mit Zeitbudget, damit ein Import nie haengt", () => {
    const k = gateKonfig({ env: { OPENROUTER_API_KEY: "x" } })
    expect(k.rollen).toBeNull()
    expect(k.budgetMs).toBeGreaterThan(0)
    expect(k.gleichzeitig).toBeGreaterThanOrEqual(8)
  })
})
