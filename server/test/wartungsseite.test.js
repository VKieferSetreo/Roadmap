// Ein Anbieter, der eine Wartungsseite mit HTTP 200 ausliefert, darf nicht wie ein
// Fehler bei uns aussehen.
//
// Berlin (gdi.berlin.de und fbinter.stadt-berlin.de) tut genau das: jeder Aufruf,
// auch GetCapabilities, beantwortet mit einer HTML-Seite "Wartungsarbeiten" und
// Status 200. Im Quellenregister stand deshalb "Seitenabruf fehlgeschlagen nach
// 3 Versuchen — Teilbestand, Reconcile-Schutz" (19.08.2026), was nach einem Bug
// im Importer aussieht und drei sinnlose Wiederholungen kostet.

import { describe, it, expect, vi, afterEach } from "vitest"
import { istWartungsseite, fetchAllFeatures } from "../src/connectors/_helpers.js"

const WARTUNG = `
        <!DOCTYPE html>
        <html lang="de"><head><title>Wartungsarbeiten</title></head>
        <body><p>Leider steht die aufgerufene Webseite wegen Wartungsarbeiten nicht zur Verf&uuml;gung.</p></body></html>`

describe("Wartungsseite statt Daten", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("erkennt die Wartungsseite", () => {
    expect(istWartungsseite(WARTUNG)).toMatch(/Wartungsarbeiten/)
  })

  it("erkennt beliebiges HTML als Stoerung, nennt es aber anders", () => {
    expect(istWartungsseite("<html><body>Fehler 502</body></html>")).toMatch(/HTML statt Daten/)
  })

  it("laesst echtes JSON in Ruhe", () => {
    expect(istWartungsseite('{"type":"FeatureCollection","features":[]}')).toBe(null)
    expect(istWartungsseite("")).toBe(null)
  })

  it("bricht ohne Retry ab und nennt den Anbieter als Ursache", async () => {
    let aufrufe = 0
    vi.stubGlobal("fetch", async () => {
      aufrufe++
      return new Response(WARTUNG, { status: 200, headers: { "content-type": "text/html" } })
    })
    await expect(
      fetchAllFeatures("https://gdi.berlin.de/services/wfs/detailnetz?service=WFS", { timeoutMs: 500 }),
    ).rejects.toThrow(/Wartungsarbeiten.*gdi\.berlin\.de/s)
    // EIN Versuch, nicht drei: gegen einen abgeschalteten Dienst hilft kein Wiederholen.
    expect(aufrufe).toBe(1)
  })
})
