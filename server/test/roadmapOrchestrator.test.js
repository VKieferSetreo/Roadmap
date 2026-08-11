// Roadmap-Orchestrator — Absicherung der harten Spec-Invarianten.
//
// Der Orchestrator ist eine LLM-Instanz, aber seine Guardrails (max 5 Runden,
// Runden-Tabelle, Konvergenz-Abbruch, Fallback-Reihenfolge, Verbot hart→weich,
// Sonderfall nicht_befahrbar) dürfen NICHT im Ermessen des Modells liegen. Diese
// Tests fahren den deterministischen Harness gegen konfigurierbare Stub-Ports und
// prüfen genau diese Regeln — kein echtes OSRM/DB/LLM nötig.

import { describe, expect, it, vi } from "vitest"
import { createRoadmapOrchestrator } from "../src/agents/roadmapOrchestrator.js"
import { stubRouting, stubSubAgent, stubValidator, bogenKandidat } from "../src/agents/stubs.js"
import {
  schneideAbschnitte,
  fuegeAbschnitteZusammen,
  lokaleReparatur,
  bewerteVollstaendigeRoute,
  aktualisiereBestenliste,
  rundenHash,
  tierVerteilung,
} from "../src/agents/planning.js"
import { RUNDEN_TABELLE, MALUS_PRO_UNGELOESTE_STELLE } from "../src/agents/contracts.js"

const KM_LNG_48 = 1 / (111.32 * Math.cos((48 * Math.PI) / 180))

/** Gerade West-Ost-Strecke bei 48° N, Punkt alle 100 m. */
function gerade(km, lat = 48, lng0 = 7) {
  const pts = []
  for (let i = 0; i <= km * 10; i++) pts.push({ lat, lng: lng0 + (i / 10) * KM_LNG_48 })
  return pts
}

const stelle = (geo, idx, modus, extra = {}) => ({ ort: geo[idx], typ: "baustelle", modus, idx, ...extra })

// ─────────────────────────────────────────────────────────────────────────────
// Deterministischer Kern (planning.js)
// ─────────────────────────────────────────────────────────────────────────────

describe("schneideAbschnitte", () => {
  const geo = gerade(50)

  it("je_stelle: ein Abschnitt pro kritischer Stelle, Id rundenstabil über kleinste Stelle", () => {
    const stellen = [stelle(geo, 100), stelle(geo, 400)]
    const a = schneideAbschnitte(stellen, geo, "je_stelle")
    expect(a).toHaveLength(2)
    expect(a[0].abschnittId).toBe("S0")
    expect(a[1].abschnittId).toBe("S1")
    expect(a[0].startIdx).toBeLessThan(a[0].endIdx)
  })

  it("benachbart_fassen: nahe Stellen landen in EINEM Abschnitt", () => {
    const stellen = [stelle(geo, 250), stelle(geo, 260)]
    const a = schneideAbschnitte(stellen, geo, "benachbart_fassen")
    expect(a).toHaveLength(1)
    expect(a[0].stellenIdx).toEqual([0, 1])
  })
})

describe("fuegeAbschnitteZusammen", () => {
  const geo = gerade(50)

  it("disjunkte Abschnitte fügen konfliktfrei zusammen", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 80, endIdx: 120 }, kandidat: { geometry: geo.slice(80, 121), eintritt: geo[80], austritt: geo[120] } },
      { abschnitt: { abschnittId: "S1", startIdx: 380, endIdx: 420 }, kandidat: { geometry: geo.slice(380, 421), eintritt: geo[380], austritt: geo[420] } },
    ]
    const { konflikte, route } = fuegeAbschnitteZusammen(geo, wahl)
    expect(konflikte).toEqual([])
    expect(route.geometry.length).toBeGreaterThan(0)
  })

  it("meldet Index-Überlappung benachbarter Abschnitte", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 80, endIdx: 200 }, kandidat: { geometry: geo.slice(80, 201), eintritt: geo[80], austritt: geo[200] } },
      { abschnitt: { abschnittId: "S1", startIdx: 150, endIdx: 260 }, kandidat: { geometry: geo.slice(150, 261), eintritt: geo[150], austritt: geo[260] } },
    ]
    const { konflikte } = fuegeAbschnitteZusammen(geo, wahl)
    expect(konflikte.some((k) => k.art === "ueberlappung" && k.abschnittId === "S1")).toBe(true)
  })

  it("meldet nicht zusammenpassenden Übergangspunkt (Sprung)", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 100, endIdx: 140 }, kandidat: { geometry: [{ lat: 49, lng: 7 }], eintritt: { lat: 49, lng: 7 }, austritt: { lat: 49, lng: 7 } } },
    ]
    const { konflikte } = fuegeAbschnitteZusammen(geo, wahl)
    expect(konflikte.some((k) => k.art === "uebergang_sprung")).toBe(true)
  })
})

describe("lokaleReparatur (Regel 9)", () => {
  const geo = gerade(50)

  it("setzt bei Überlappung höchstens 2 Versuche an und beschneidet den Übergang", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 80, endIdx: 200 }, kandidat: { geometry: geo.slice(80, 201), eintritt: geo[80], austritt: geo[200], hash: "a" } },
      { abschnitt: { abschnittId: "S1", startIdx: 150, endIdx: 260 }, kandidat: { geometry: geo.slice(150, 261), eintritt: geo[150], austritt: geo[260], hash: "b" } },
    ]
    const rep = lokaleReparatur(geo, wahl, new Map())
    expect(rep.reparaturen.length).toBeGreaterThan(0)
    expect(rep.reparaturen.length).toBeLessThanOrEqual(2)
    expect(rep.reparaturen[0].art).toBe("ueberlappung_beschnitten")
  })

  it("setzt einen alternativen Kandidaten aus der Bestenliste ein", () => {
    const s0 = { abschnittId: "S0", startIdx: 100, endIdx: 140 }
    const schlecht = { geometry: [{ lat: 49, lng: 7 }], eintritt: { lat: 49, lng: 7 }, austritt: { lat: 49, lng: 7 }, hash: "weit", kosten: 5 }
    const gut = { geometry: geo.slice(100, 141), eintritt: geo[100], austritt: geo[140], hash: "nah", kosten: 6 }
    const wahl = [{ abschnitt: s0, kandidat: schlecht }]
    const bestenlisten = new Map([["S0", [schlecht, gut]]])
    const rep = lokaleReparatur(geo, wahl, bestenlisten)
    expect(rep.reparaturen.some((r) => r.art === "alternativer_kandidat" && r.erfolgreich)).toBe(true)
    expect(rep.wahl[0].kandidat.hash).toBe("nah")
  })
})

describe("Bewertung & Bestenlisten (Regel 15)", () => {
  it("addiert Malus je ungelöster Stelle", () => {
    const wahl = [{ kandidat: { kosten: 10 } }, { kandidat: { kosten: 20 } }]
    expect(bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: 0 })).toBe(30)
    expect(bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: 2 })).toBe(30 + 2 * MALUS_PRO_UNGELOESTE_STELLE)
  })

  it("sortiert nach Kosten, bei Gleichstand gewinnt die höhere Tier", () => {
    const bl = new Map()
    aktualisiereBestenliste(bl, "S0", [
      { hash: "x", kosten: 10, tier: "A" },
      { hash: "y", kosten: 10, tier: "C" },
      { hash: "z", kosten: 8, tier: "A" },
    ])
    const liste = bl.get("S0")
    expect(liste[0].hash).toBe("z") // billigster zuerst
    expect(liste[1].tier).toBe("C") // Gleichstand 10 → höhere Tier vor A
  })
})

describe("rundenHash (Regel 14) & tierVerteilung", () => {
  it("gleiche Kandidaten → gleicher Hash, andere → anderer", () => {
    const r1 = [{ abschnittId: "S0", kandidaten: [{ hash: "a" }, { hash: "b" }] }]
    const r2 = [{ abschnittId: "S0", kandidaten: [{ hash: "a" }, { hash: "b" }] }]
    const r3 = [{ abschnittId: "S0", kandidaten: [{ hash: "a" }, { hash: "c" }] }]
    expect(rundenHash(r1)).toBe(rundenHash(r2))
    expect(rundenHash(r1)).not.toBe(rundenHash(r3))
  })

  it("summiert Kilometer nach Tier", () => {
    const v = tierVerteilung([
      { kandidat: { tier: "A", distanzKm: 3 } },
      { kandidat: { tier: "A", distanzKm: 2 } },
      { kandidat: { tier: "C", distanzKm: 4 } },
    ])
    expect(v).toEqual({ A_km: 5, B_km: 0, C_km: 4 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Harness (roadmapOrchestrator.js)
// ─────────────────────────────────────────────────────────────────────────────

describe("Roadmap-Orchestrator — Loop", () => {
  const geo = gerade(50)
  const baue = (init, subFn, valFn) =>
    createRoadmapOrchestrator({
      routing: stubRouting(init),
      subAgent: stubSubAgent(subFn),
      validator: stubValidator(valFn),
    })

  it("Regel 3: alle Stellen auf 'keine' → Initialstrecke ohne Sub-Agenten", async () => {
    const spy = vi.fn()
    const orch = createRoadmapOrchestrator({
      routing: stubRouting({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "keine")] }),
      subAgent: { bearbeite: spy },
      validator: stubValidator(),
    })
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.status).toBe("initialstrecke")
    expect(r.verbrauchte_runden).toBe(0)
    expect(r.ungeloeste_stellen).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it("löst eine Stelle in Runde 1 vollständig", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "hart")] })
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.abbruchgrund).toBe("geloest")
    expect(r.verbrauchte_runden).toBe(1)
    expect(r.ungeloeste_stellen).toEqual([])
    expect(r.tier_verteilung.A_km).toBeGreaterThan(0) // Runde 1 ist Tier A
  })

  it("verbraucht eine Runde je Validierungs-Ablehnung, gibt dann frei", async () => {
    let n = 0
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "hart")] }, undefined, () => ({ freigabe: ++n >= 2 }))
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.verbrauchte_runden).toBe(2)
  })

  it("Verbot: 'hart' wird NIE zu 'weich' degradiert — auch nicht in den weichen Runden 3–5", async () => {
    const modi = []
    const klassen = []
    const orch = baue(
      { geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "hart")] },
      (a) => {
        modi.push(a.modus)
        klassen.push(a.rundenParameter.strassenklasse)
        return { abschnittId: a.abschnittId, geloest: false, kandidaten: [bogenKandidat(a)] } // findet nie eine Lösung
      },
    )
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.verbrauchte_runden).toBe(5)
    expect(r.abbruchgrund).toBe("budget")
    expect(r.status).toBe("teilergebnis")
    expect(modi.every((m) => m === "hart")).toBe(true) // Umfahrungsmodus bleibt hart
    expect(klassen).toContain("weich") // obwohl die Straßenklasse ab Runde 3 weich wird
  })

  it("Regel 14: identische Kandidaten zweier Runden → sofortiger Konvergenz-Abbruch", async () => {
    const fixerKandidat = (a) => ({
      geometry: a.abschnitt, eintritt: a.abschnitt[0], austritt: a.abschnitt.at(-1),
      kosten: 7, distanzKm: 4, tier: "A", hash: "IMMER_GLEICH",
    })
    const orch = baue(
      { geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "weich")] },
      (a) => ({ abschnittId: a.abschnittId, geloest: false, kandidaten: [fixerKandidat(a)] }),
      () => ({ freigabe: false }),
    )
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.abbruchgrund).toBe("konvergenz")
    expect(r.verbrauchte_runden).toBe(2)
  })

  it("Regel 17: harte Sperre ohne Umfahrung → nicht_befahrbar (nicht initialstrecke)", async () => {
    const orch = baue(
      { geometry: geo, distanzKm: 50, harteSperreVorhanden: true, kritischeStellen: [stelle(geo, 250, "hart")] },
      (a) => ({ abschnittId: a.abschnittId, geloest: false, kandidaten: [] }), // keine Umfahrung
      () => ({ freigabe: false }), // Route mit Sperre besteht die Validierung nicht
    )
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(r.status).toBe("nicht_befahrbar")
    expect(r.ungeloeste_stellen[0].modus).toBe("hart")
    expect(r.ungeloeste_stellen[0].grund_des_scheiterns).toMatch(/harte Sperre/)
  })

  it("liefert die vollständige Spec-Rückgabeform", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "hart")] })
    const r = await orch.plane({ start: "A", ziel: "B" })
    expect(Object.keys(r).sort()).toEqual(
      ["abbruchgrund", "reparaturen", "route", "status", "tier_verteilung", "ungeloeste_stellen", "verbrauchte_runden"].sort(),
    )
    expect(r.tier_verteilung).toHaveProperty("A_km")
    expect(r.tier_verteilung).toHaveProperty("B_km")
    expect(r.tier_verteilung).toHaveProperty("C_km")
  })

  it("Sub-Agent bekommt NIE die Gesamtstrecke (nur seinen Abschnitt)", async () => {
    let gesehen = null
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, "hart")] }, (a) => {
      gesehen = a
      return { abschnittId: a.abschnittId, geloest: true, kandidaten: [bogenKandidat(a)] }
    })
    await orch.plane({ start: "A", ziel: "B" })
    expect(gesehen.abschnitt.length).toBeLessThan(geo.length) // echter Teil, nicht die ganze Route
    expect(gesehen).not.toHaveProperty("gesamtstrecke")
    expect(RUNDEN_TABELLE[0].zeitdeckelMin).toBe(15) // Rundenparameter durchgereicht
    expect(gesehen.rundenParameter.zeitdeckelMin).toBe(15)
  })
})
