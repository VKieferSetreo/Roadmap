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
  it.each([
    [4.25, "kritisch"], // 0,05 m
    [4.29, "kritisch"], // 0,09 m
    [4.3, "warnung"], //   0,10 m — Grenzwert exklusiv
    [4.69, "warnung"], //  0,49 m
    [4.7, "hinweis"], //   0,50 m — Grenzwert exklusiv
    [5.0, "hinweis"],
  ])("maxHoeheM %f → %s", (maxHoeheM, severity) => {
    expect(evaluate(ob("bruecke", { maxHoeheM }), TR, {}).severity).toBe(severity)
    expect(evaluate(ob("tunnel", { maxHoeheM }), TR, {}).severity).toBe(severity)
  })

  it("negativer Spielraum mit deutscher Formatierung (Spec-Beispiel)", () => {
    const r = evaluate(ob("bruecke", { maxHoeheM: 3.8 }), TR, {})
    expect(r.severity).toBe("kritisch")
    expect(r.detail["Durchfahrtshöhe"]).toBe("3,80 m")
    expect(r.detail["Transporthöhe"]).toBe("4,20 m")
    expect(r.detail["Spielraum"]).toBe("−0,40 m")
  })

  it("fehlende attrs → Default hinweis mit vorhandenen Details", () => {
    const r = evaluate(ob("bruecke", {}), TR, {})
    expect(r.severity).toBe("hinweis")
    expect(r.detail["Transporthöhe"]).toBe("4,20 m")
    expect(r.detail["Durchfahrtshöhe"]).toBeUndefined()
  })
})

describe("engstelle — Marge", () => {
  it.each([
    [3.05, "kritisch"],
    [3.1, "warnung"],
    [3.49, "warnung"],
    [3.5, "hinweis"],
  ])("maxBreiteM %f → %s", (maxBreiteM, severity) => {
    expect(evaluate(ob("engstelle", { maxBreiteM }), TR, {}).severity).toBe(severity)
  })
})

describe("gewicht — Rest + Achslast", () => {
  it.each([
    [67.9, "kritisch"], // Rest −0,1 t
    [68, "warnung"], //    Rest 0 t
    [77.9, "warnung"], //  Rest 9,9 t
    [78, "hinweis"], //    Rest 10 t — Grenzwert exklusiv
  ])("maxGewichtT %f → %s", (maxGewichtT, severity) => {
    expect(evaluate(ob("gewicht", { maxGewichtT }), TR, {}).severity).toBe(severity)
  })

  it("Achslast-Überschreitung (max aus achslasten[]) eskaliert auf kritisch", () => {
    const r = evaluate(ob("gewicht", { maxGewichtT: 100, maxAchslastT: 11 }), TR, {})
    expect(r.severity).toBe("kritisch") // max(achslasten) = 11,5 > 11
    expect(r.detail["Achslast"]).toBe("11,5 t")
  })

  it("Achslast eingehalten → keine Eskalation", () => {
    const r = evaluate(ob("gewicht", { maxGewichtT: 100, maxAchslastT: 12 }), TR, {})
    expect(r.severity).toBe("hinweis")
  })

  it("heterogene achslasten: die höchste Achse zählt", () => {
    const tr = { ...TR, achslasten: [9, 12, 10] }
    const r = evaluate(ob("gewicht", { maxGewichtT: 100, maxAchslastT: 11 }), tr, {})
    expect(r.severity).toBe("kritisch") // 12 > 11
    expect(r.detail["Achslast"]).toBe("12,0 t")
  })

  it("leeres/fehlendes achslasten[] → keine Achslast-Eskalation, kein Achslast-Detail", () => {
    const r = evaluate(ob("gewicht", { maxGewichtT: 100, maxAchslastT: 11 }), { ...TR, achslasten: [] }, {})
    expect(r.severity).toBe("hinweis")
    expect(r.detail["Zul. Achslast"]).toBe("11,0 t")
    expect(r.detail["Achslast"]).toBeUndefined()
  })
})

describe("steigung", () => {
  it.each([
    [8, 61, "kritisch"],
    [8, 60, "warnung"], //   >60 t exklusiv
    [12, 40, "warnung"],
    [5, 101, "warnung"], //  ≥5 % nur bei >100 t
    [5, 100, "hinweis"],
    [4.9, 200, "hinweis"],
  ])("steigungPct %f bei %f t → %s", (steigungPct, gesamtgewicht, severity) => {
    const r = evaluate(ob("steigung", { steigungPct }), { ...TR, gesamtgewicht }, {})
    expect(r.severity).toBe(severity)
  })
})

describe("kreisverkehr — Schleppkurve", () => {
  it.each([
    [10, 23, "kritisch"], // > 2,2·r = 22
    [10, 20, "warnung"], //  > 1,6·r = 16
    [10, 16, "hinweis"],
    [10, 15, "hinweis"],
  ])("radiusM %f, laenge %f → %s", (radiusM, laenge, severity) => {
    expect(evaluate(ob("kreisverkehr", { radiusM }), { ...TR, laenge }, {}).severity).toBe(severity)
  })
})

describe("baustelle", () => {
  const zeitraum = { von: "2026-06-15T22:00", bis: "2026-06-17T14:00" }

  it("Restbreite < breite+0,1 → kritisch", () => {
    const r = evaluate(ob("baustelle", { restbreiteM: 3.05 }), TR, {})
    expect(r.severity).toBe("kritisch")
  })

  it("ausreichende Restbreite + Überlappung mit Zeitraum → warnung", () => {
    const r = evaluate(
      ob("baustelle", { restbreiteM: 3.6 }, { gueltigVon: "2026-06-01", gueltigBis: "2026-07-01" }),
      TR, zeitraum,
    )
    expect(r.severity).toBe("warnung")
  })

  it("keine Überlappung mit Zeitraum → hinweis", () => {
    const r = evaluate(
      ob("baustelle", { restbreiteM: 3.6 }, { gueltigVon: "2026-07-01", gueltigBis: "2026-08-01" }),
      TR, zeitraum,
    )
    expect(r.severity).toBe("hinweis")
  })

  it("ohne geplanten Zeitraum → hinweis", () => {
    const r = evaluate(ob("baustelle", { restbreiteM: 3.6 }), TR, {})
    expect(r.severity).toBe("hinweis")
  })
})

describe("bahnuebergang / ampel", () => {
  it("Transporthöhe über Oberleitung → kritisch", () => {
    const r = evaluate(ob("bahnuebergang", { maxHoeheM: 4.1 }), TR, {})
    expect(r.severity).toBe("kritisch")
  })

  it("Oberleitung hoch genug → hinweis + DB-Netz-Hinweis", () => {
    const r = evaluate(ob("bahnuebergang", { maxHoeheM: 5.5 }), TR, {})
    expect(r.severity).toBe("hinweis")
    expect(r.detail["Hinweis"]).toBe("Anmeldung DB Netz erforderlich")
  })

  it("ampel: Höhe über Signalausleger → warnung, sonst hinweis", () => {
    expect(evaluate(ob("ampel", { maxHoeheM: 4.1 }), TR, {}).severity).toBe("warnung")
    expect(evaluate(ob("ampel", { maxHoeheM: 4.5 }), TR, {}).severity).toBe("hinweis")
  })
})

describe("titel + formatierung", () => {
  it("nutzt obstacle.name als Titel, sonst Kategorie-Default", () => {
    expect(evaluate(ob("bruecke", { maxHoeheM: 5 }, { name: "Brücke Seevetal" }), TR, {}).titel)
      .toBe("Brücke Seevetal")
    expect(evaluate(ob("kreisverkehr", {}), TR, {}).titel).toBe("Kreisverkehr")
  })

  it("fmtKomma: Komma-Dezimaltrennung, − für negativ", () => {
    expect(fmtKomma(3.8)).toBe("3,80")
    expect(fmtKomma(-0.4)).toBe("−0,40")
    expect(fmtKomma(12, 1)).toBe("12,0")
  })
})
