import { describe, it, expect } from "vitest"
import { parseVemagsText, classifyToken, routableWaypoints } from "../src/external/vemags.js"

// Minimaler, repräsentativer VEMAGS-Bescheid-Textauszug (Struktur wie echtes pdftotext -layout).
const TEXT = `
      Länge: 14,3 m                Breite: 4,99 m                Höhe: 3,46 m                Masse: 83,25 t
      Achslast [t]      7,7   7   9   9   11
9.   Fahrtweg
                                                                          Fahrtweg geändert
      Fahrtweg: 1                                                         siehe Anlage 2
        Fahrtwegteil: 1.1 - Leerfahrt
           Start: 77743 Altenheim, L98 {GüG Eschau}
                  GüG Eschau - L98 - AS Offenburg - A5 - AD Hattenbach - A7 - Hesel - B72
            Ziel:  26607 Aurich, Kreihüttenmoorweg 25 {ELEC}
        Fahrtwegteil: 1.2 - Lastfahrt
           Start: 26607 Aurich, Kreihüttenmoorweg 25 {ELEC}
                  Kreihüttenmoorweg - AS Leer-Ost - A28 - AK Bielefeld - links im Gegenverkehr K29 - rechts B64
            Ziel:  34434 Borgentreich, K21 {WP Borgentreich SÜD}
10. Antragsrelevante Mitteilungen:
      Fahrtweg: 1
`

describe("VEMAGS-Parser (T-567)", () => {
  it("Maße + Achslasten aus dem Bescheid", () => {
    const { spec } = parseVemagsText(TEXT)
    expect(spec.laengeM).toBe(14.3)
    expect(spec.breiteM).toBe(4.99)
    expect(spec.hoeheM).toBe(3.46)
    expect(spec.masseT).toBe(83.25)
    expect(spec.achslastenT).toEqual([7.7, 7, 9, 9, 11])
  })

  it("Punkt 9 → 1 Fahrtweg / 2 Fahrtwegteile (Trailing-Text 'siehe Anlage 2' egal)", () => {
    const { strecken } = parseVemagsText(TEXT)
    expect(strecken).toHaveLength(2) // 1 Strecke je Fahrtwegteil; 'Fahrtweg: 1' in Punkt 10 zählt NICHT
    expect(strecken[1].istLastfahrt).toBe(true)
    expect(strecken[0].name).toBe("Fahrtwegteil 1.1 — Leerfahrt")
  })

  it("Wegpunkte: Knoten+Orte behalten, Straßennummern + Anweisungen raus, Reihenfolge stimmt", () => {
    const { strecken } = parseVemagsText(TEXT)
    const w = strecken[0].punkte.map((p) => p.raw)
    expect(w[0]).toContain("77743 Altenheim") // Start
    expect(w[w.length - 1]).toContain("26607 Aurich") // Ziel
    expect(w).toContain("Anschlussstelle Offenburg") // Knoten behalten, Kürzel ausgeschrieben
    expect(w).toContain("Hesel") // Ort behalten
    expect(w).not.toContain("A5") // Straßennummer raus
    expect(w).not.toContain("L98")
    // Lastfahrt: Fahranweisungen + Straßennummern raus
    const w2 = strecken[1].punkte.map((p) => p.raw)
    expect(w2.some((x) => /gegenverkehr|rechts B64|K29/i.test(x))).toBe(false)
    expect(w2).toContain("Autobahnkreuz Bielefeld")
  })

  it("classifyToken: Klassifikation", () => {
    expect(classifyToken("A5").typ).toBe("road")
    expect(classifyToken("B33a").typ).toBe("road")
    expect(classifyToken("AS Offenburg").typ).toBe("junction")
    expect(classifyToken("AS Offenburg").raw).toBe("Anschlussstelle Offenburg") // Kürzel ausgeschrieben
    expect(classifyToken("AD Hattenbach").typ).toBe("junction")
    expect(classifyToken("links im Gegenverkehr K29").typ).toBe("road") // Manöver gestrippt -> K29 = Straße
    expect(classifyToken("Hesel").typ).toBe("place")
    expect(routableWaypoints([classifyToken("A5"), classifyToken("Hesel")])).toHaveLength(1)
  })
})
