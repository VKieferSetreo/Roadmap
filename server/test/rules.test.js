// Regelwerk: Grenzwerte je Kategorie + Gültigkeit + deutsche Zahlformatierung.

import { describe, expect, it } from "vitest"
import { evaluate, fmtKomma } from "../src/engine/rules.js"

// Transport-Basis (DEFAULT_TRANSPORT v2), pro Test überschreibbar
const TR = {
  laenge: 24.5, breite: 3.0, hoehe: 4.2,
  gesamtgewicht: 68, achsen: 8,
  achslasten: [11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5],
}

const ob = (kategorie, attrs = {}, extra = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  kategorie, name: "", attrs, ...extra,
})

describe("Gültigkeit", () => {
  it("gueltigBis vor zeitraum.von → null (abgelaufen)", () => {
    const r = evaluate(
      ob("bruecke", { maxHoeheM: 3.0 }, { gueltigBis: "2026-01-01" }),
      TR,
      { von: "2026-06-15T22:00" },
    )
    expect(r).toBeNull()
  })

  it("gueltigBis am selben Tag wie zeitraum.von → nicht abgelaufen", () => {
    const r = evaluate(
      ob("bruecke", { maxHoeheM: 3.0 }, { gueltigBis: "2026-06-15" }),
      TR,
      { von: "2026-06-15T22:00" },
    )
    expect(r).not.toBeNull()
  })

  it("ohne zeitraum bleibt das Hindernis relevant", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 3.0 }, { gueltigBis: "2020-01-01" }), TR, {})).not.toBeNull()
  })
})

describe("bruecke/tunnel — Spielraum", () => {
  // Infrastruktur: nur Abweichungen (warnung/kritisch). Ausreichend Spielraum
  // (sonst „hinweis") → ausgeblendet (null).
  it.each([
    [4.25, "kritisch"], // 0,05 m
    [4.29, "kritisch"], // 0,09 m
    [4.3, "warnung"], //   0,10 m — Grenzwert exklusiv
    [4.69, "warnung"], //  0,49 m
    [4.7, null], //        0,50 m — ausreichend → ausgeblendet
    [5.0, null], //        ausreichend → ausgeblendet
  ])("maxHoeheM %f → %s", (maxHoeheM, severity) => {
    const rb = evaluate(ob("bruecke", { maxHoeheM }), TR, {})
    const rt = evaluate(ob("tunnel", { maxHoeheM }), TR, {})
    if (severity === null) {
      expect(rb).toBeNull()
      expect(rt).toBeNull()
    } else {
      expect(rb.severity).toBe(severity)
      expect(rt.severity).toBe(severity)
    }
  })

  it("negativer Spielraum mit deutscher Formatierung (Spec-Beispiel)", () => {
    const r = evaluate(ob("bruecke", { maxHoeheM: 3.8 }), TR, {})
    expect(r.severity).toBe("kritisch")
    expect(r.detail["Durchfahrtshöhe"]).toBe("3,80 m")
    expect(r.detail["Transporthöhe"]).toBe("4,20 m")
    expect(r.detail["Spielraum"]).toBe("−0,40 m")
  })

  it("fehlende attrs (keine hinterlegte Höhe) → ausgeblendet (Infrastruktur ohne Abweichung)", () => {
    expect(evaluate(ob("bruecke", {}), TR, {})).toBeNull()
  })
})

describe("bruecke/tunnel — Tragfähigkeit + GST-Sperre (ruleBauwerk)", () => {
  // NRW-Fall: Brücke NUR mit Lastgrenze (keine Höhe). Früher fälschlich als "hinweis"
  // gedroppt — jetzt korrekt bewertet (Transport 68 t).
  it.each([
    [60, "kritisch"], // 68 > 60 → überschritten
    [70, "warnung"], //  Reserve 2 t < 10 → knapp
    [90, null], //       Reserve 22 t → ausreichend → ausgeblendet
  ])("maxGewichtT %f → %s", (maxGewichtT, severity) => {
    const r = evaluate(ob("bruecke", { maxGewichtT }), TR, {})
    if (severity === null) expect(r).toBeNull()
    else {
      expect(r.severity).toBe(severity)
      expect(r.detail["Zul. Brückenlast"]).toBeTruthy()
    }
  })

  it("grundsätzliche GST-Sperre ohne weitere Werte → warnung (nicht ausgeblendet)", () => {
    const r = evaluate(ob("bruecke", { grundsaetzlicheGstSperre: true }), TR, {})
    expect(r).not.toBeNull()
    expect(r.severity).toBe("warnung")
  })

  it("Höhe ausreichend ABER GST-Sperre → warnung (Sperre hebt an)", () => {
    const r = evaluate(ob("bruecke", { maxHoeheM: 5.0, grundsaetzlicheGstSperre: true }), TR, {})
    expect(r.severity).toBe("warnung")
  })

  it("gesperrtKomplett (harte Schwerverkehr-Sperre) → kritisch, auch ohne Maße", () => {
    const r = evaluate(ob("bruecke", { gesperrtKomplett: true }), TR, {})
    expect(r).not.toBeNull()
    expect(r.severity).toBe("kritisch")
    expect(r.beschreibung).toMatch(/gesperrt/i)
  })

  it("Höhe UND Last gemeinsam — schlimmste zählt (Last überschritten)", () => {
    const r = evaluate(ob("bruecke", { maxHoeheM: 5.0, maxGewichtT: 50 }), TR, {})
    expect(r.severity).toBe("kritisch")
    expect(r.detail["Durchfahrtshöhe"]).toBe("5,00 m")
    expect(r.detail["Zul. Brückenlast"]).toBe("50,0 t")
  })

  it("Tunnel mit Lastgrenze wird ebenfalls bewertet", () => {
    expect(evaluate(ob("tunnel", { maxGewichtT: 50 }), TR, {}).severity).toBe("kritisch")
  })
})

describe("engstelle — Marge", () => {
  it.each([
    [3.05, "kritisch"],
    [3.1, "warnung"],
    [3.49, "warnung"],
    [3.5, null], // ausreichende Marge → ausgeblendet (Infrastruktur ohne Abweichung)
  ])("maxBreiteM %f → %s", (maxBreiteM, severity) => {
    const r = evaluate(ob("engstelle", { maxBreiteM }), TR, {})
    if (severity === null) expect(r).toBeNull()
    else expect(r.severity).toBe(severity)
  })
})

describe("gewicht — nur Gesamtgewicht (Achslast entfernt)", () => {
  it.each([
    [67.9, "kritisch"], // Rest −0,1 t
    [68, "warnung"], //    Rest 0 t
    [77.9, "warnung"], //  Rest 9,9 t
    [78, null], //         Rest 10 t — ausreichend → ausgeblendet
  ])("maxGewichtT %f → %s", (maxGewichtT, severity) => {
    const r = evaluate(ob("gewicht", { maxGewichtT }), TR, {})
    if (severity === null) expect(r).toBeNull()
    else expect(r.severity).toBe(severity)
  })

  it("Achslast wird NICHT mehr bewertet: maxAchslastT allein (kein maxGewichtT) → kein Fund", () => {
    // ohne Gesamtlast bleibt nur ein hinweis → evaluate() blendet aus (Achslast zählt nicht mehr)
    expect(evaluate(ob("gewicht", { maxAchslastT: 11 }), TR, {})).toBeNull()
  })

  it("maxAchslastT zusätzlich zu maxGewichtT ändert nichts (nur Gesamtgewicht zählt)", () => {
    const mitAchs = evaluate(ob("gewicht", { maxGewichtT: 100, maxAchslastT: 5 }), TR, {})
    const ohneAchs = evaluate(ob("gewicht", { maxGewichtT: 100 }), TR, {})
    expect(mitAchs?.severity ?? null).toBe(ohneAchs?.severity ?? null)
  })
})

describe("steigung", () => {
  it.each([
    [8, 61, "kritisch"],
    [8, 60, "warnung"], //   >60 t exklusiv
    [12, 40, "warnung"],
    [5, 101, "warnung"], //  ≥5 % nur bei >100 t
    [5, 100, null], //       unkritisch → ausgeblendet
    [4.9, 200, null], //     unkritisch → ausgeblendet
  ])("steigungPct %f bei %f t → %s", (steigungPct, gesamtgewicht, severity) => {
    const r = evaluate(ob("steigung", { steigungPct }), { ...TR, gesamtgewicht }, {})
    if (severity === null) expect(r).toBeNull()
    else expect(r.severity).toBe(severity)
  })
})

describe("kreisverkehr — Schleppkurve", () => {
  it.each([
    [10, 23, "kritisch"], // > 2,2·r = 22
    [10, 20, "warnung"], //  > 1,6·r = 16
    [10, 16, null], //       unkritisch → ausgeblendet
    [10, 15, null], //       unkritisch → ausgeblendet
  ])("radiusM %f, laenge %f → %s", (radiusM, laenge, severity) => {
    const r = evaluate(ob("kreisverkehr", { radiusM }), { ...TR, laenge }, {})
    if (severity === null) expect(r).toBeNull()
    else expect(r.severity).toBe(severity)
  })
})

describe("baustelle", () => {
  const zeitraum = { von: "2026-06-15T22:00", bis: "2026-06-17T14:00" }

  it("Restbreite < Transportbreite → kritisch (echte Verletzung)", () => {
    const r = evaluate(ob("baustelle", { restbreiteM: 2.9 }), TR, {}) // 2,90 < 3,00
    expect(r.severity).toBe("kritisch")
  })

  it("Restbreite ≥ Transportbreite → NICHT kritisch (3,05 reicht für 3,00, kein Puffer)", () => {
    // Max 2026-06-14: passt = passt → nicht kritisch. Ohne Transport-Zeitraum gilt das
    // Hindernis als relevant (T-267) → warnung (sichtbar zur Prüfung), nicht kritisch.
    const r = evaluate(ob("baustelle", { restbreiteM: 3.05 }), TR, {})
    expect(r.severity).toBe("warnung")
  })

  it("ausreichende Restbreite + Überlappung mit Zeitraum → warnung", () => {
    const r = evaluate(
      ob("baustelle", { restbreiteM: 3.6 }, { gueltigVon: "2026-06-01", gueltigBis: "2026-07-01" }),
      TR, zeitraum,
    )
    expect(r.severity).toBe("warnung")
  })

  it("beginnt erst NACH dem Transport-Zeitraum → nicht relevant (null)", () => {
    const r = evaluate(
      ob("baustelle", { restbreiteM: 3.6 }, { gueltigVon: "2026-07-01", gueltigBis: "2026-08-01" }),
      TR, zeitraum,
    )
    expect(r).toBeNull()
  })

  it("ohne geplanten Zeitraum → warnung (gilt immer, nicht ausgeblendet) (T-267)", () => {
    const r = evaluate(ob("baustelle", { restbreiteM: 3.6 }), TR, {})
    expect(r.severity).toBe("warnung")
  })

  it("baustelle mit Vollsperrung → kritisch, im Zeitraum UND ohne Zeitraum (T-265)", () => {
    const imZeitraum = evaluate(
      ob("baustelle", { vollsperrung: true }, { gueltigVon: "2026-06-01", gueltigBis: "2026-07-01" }),
      TR, zeitraum,
    )
    expect(imZeitraum.severity).toBe("kritisch")
    // ohne geplanten Transport-Zeitraum gilt es als relevant (T-267) → Vollsperrung bleibt kritisch
    const ohneZeitraum = evaluate(ob("baustelle", { vollsperrung: true }), TR, {})
    expect(ohneZeitraum.severity).toBe("kritisch")
  })
})

describe("bahnuebergang / ampel", () => {
  it("Transporthöhe über Oberleitung → kritisch", () => {
    const r = evaluate(ob("bahnuebergang", { maxHoeheM: 4.1 }), TR, {})
    expect(r.severity).toBe("kritisch")
  })

  it("Oberleitung hoch genug → ausgeblendet (keine Abweichung)", () => {
    expect(evaluate(ob("bahnuebergang", { maxHoeheM: 5.5 }), TR, {})).toBeNull()
  })

  it("ampel: Höhe über Signalausleger → warnung; hoch genug → ausgeblendet", () => {
    expect(evaluate(ob("ampel", { maxHoeheM: 4.1 }), TR, {}).severity).toBe("warnung")
    expect(evaluate(ob("ampel", { maxHoeheM: 4.5 }), TR, {})).toBeNull()
  })
})

describe("titel + formatierung", () => {
  it("nutzt obstacle.name als Titel, sonst Kategorie-Default", () => {
    // Werte so gewählt, dass eine Abweichung entsteht (sonst ausgeblendet)
    expect(evaluate(ob("bruecke", { maxHoeheM: 3.8 }, { name: "Brücke Seevetal" }), TR, {}).titel)
      .toBe("Brücke Seevetal")
    expect(evaluate(ob("kreisverkehr", { radiusM: 5 }), TR, {}).titel).toBe("Kreisverkehr")
  })

  it("fmtKomma: Komma-Dezimaltrennung, − für negativ", () => {
    expect(fmtKomma(3.8)).toBe("3,80")
    expect(fmtKomma(-0.4)).toBe("−0,40")
    expect(fmtKomma(12, 1)).toBe("12,0")
  })
})

describe("Wirksamkeit — gueltigVon/realerStart vs Transport-Zeitraum", () => {
  const zeitraum = { von: "2026-06-15T22:00", bis: "2026-06-17T14:00" }

  it("greift erst nach Transport-Ende (gueltigVon) → null", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 3 }, { gueltigVon: "2026-07-01" }), TR, zeitraum)).toBeNull()
  })

  it("greift erst nach Transport-Ende (nur realerStart) → null", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 3 }, { realerStart: "2026-07-01" }), TR, zeitraum)).toBeNull()
  })

  it("greift vor Transport-Ende → relevant", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 3 }, { realerStart: "2026-06-16" }), TR, zeitraum)).not.toBeNull()
  })

  it("ohne Transport-Zeitraum bleibt alles relevant", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 3 }, { realerStart: "2027-01-01" }), TR, {})).not.toBeNull()
  })
})
