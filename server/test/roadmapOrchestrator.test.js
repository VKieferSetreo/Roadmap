// Roadmap-Orchestrator — Absicherung der harten Spec-/Workflow-Invarianten.
//
// Der Orchestrator ist eine LLM-Instanz, aber seine Guardrails (Phase-0-Vollständig-
// keit ohne Defaults, max 5 Runden, Runden-Tabelle, Verbot hart→weich, Validierung
// vor Merge, akzeptierte Abschnitte, Konvergenz-Abbruch, Fallback-Kaskade, Sonderfall
// nicht_befahrbar) liegen NICHT im Ermessen des Modells. Diese Tests fahren den
// deterministischen Harness gegen konfigurierbare Stub-Ports — kein echtes OSRM/DB/LLM.

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
import { RUNDEN_TABELLE, MALUS_PRO_UNGELOESTE_STELLE, AuftragUnvollstaendig, KLASSE } from "../src/agents/contracts.js"

const KM_LNG_48 = 1 / (111.32 * Math.cos((48 * Math.PI) / 180))

/** Gerade West-Ost-Strecke bei 48° N, Punkt alle 100 m. */
function gerade(km, lat = 48, lng0 = 7) {
  const pts = []
  for (let i = 0; i <= km * 10; i++) pts.push({ lat, lng: lng0 + (i / 10) * KM_LNG_48 })
  return pts
}

/** Vollständiger Auftrag (Phase 0) — Overrides via Spread. */
const auftrag = (over = {}) => ({
  start: "A",
  ziel: "B",
  fahrzeugprofil: { hoehe: 4.2, breite: 3.0, laenge: 40, gewicht: 80, achslast: 11 },
  restriktionen: {},
  zeitfenster: { von: "06:00", bis: "20:00" },
  umfahrungsmodusGlobal: "hart",
  ...over,
})

const stelle = (geo, idx, { modus, klasse = KLASSE.HINDERNIS, ...extra } = {}) => ({
  ort: geo[idx], typ: "baustelle", idx, klasse, ...(modus ? { modus } : {}), ...extra,
})

// ─────────────────────────────────────────────────────────────────────────────
// Deterministischer Kern (planning.js)
// ─────────────────────────────────────────────────────────────────────────────

describe("schneideAbschnitte", () => {
  const geo = gerade(50)
  it("je_stelle: ein Abschnitt pro Stelle, Id rundenstabil (S<minStelle>)", () => {
    const a = schneideAbschnitte([stelle(geo, 100), stelle(geo, 400)], geo, "je_stelle")
    expect(a).toHaveLength(2)
    expect(a[0].abschnittId).toBe("S0")
    expect(a[1].abschnittId).toBe("S1")
  })
  it("benachbart_fassen: nahe Stellen in EINEM Abschnitt", () => {
    const a = schneideAbschnitte([stelle(geo, 250), stelle(geo, 260)], geo, "benachbart_fassen")
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
    expect(fuegeAbschnitteZusammen(geo, wahl).konflikte).toEqual([])
  })
  it("meldet Index-Überlappung benachbarter Abschnitte", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 80, endIdx: 200 }, kandidat: { geometry: geo.slice(80, 201), eintritt: geo[80], austritt: geo[200] } },
      { abschnitt: { abschnittId: "S1", startIdx: 150, endIdx: 260 }, kandidat: { geometry: geo.slice(150, 261), eintritt: geo[150], austritt: geo[260] } },
    ]
    expect(fuegeAbschnitteZusammen(geo, wahl).konflikte.some((k) => k.art === "ueberlappung")).toBe(true)
  })
  it("meldet nicht zusammenpassenden Übergangspunkt", () => {
    const wahl = [{ abschnitt: { abschnittId: "S0", startIdx: 100, endIdx: 140 }, kandidat: { geometry: [{ lat: 49, lng: 7 }], eintritt: { lat: 49, lng: 7 }, austritt: { lat: 49, lng: 7 } } }]
    expect(fuegeAbschnitteZusammen(geo, wahl).konflikte.some((k) => k.art === "uebergang_sprung")).toBe(true)
  })
})

describe("lokaleReparatur (Regel 28)", () => {
  const geo = gerade(50)
  it("max 2 Versuche, beschneidet Überlappung", () => {
    const wahl = [
      { abschnitt: { abschnittId: "S0", startIdx: 80, endIdx: 200 }, kandidat: { geometry: geo.slice(80, 201), eintritt: geo[80], austritt: geo[200], hash: "a" } },
      { abschnitt: { abschnittId: "S1", startIdx: 150, endIdx: 260 }, kandidat: { geometry: geo.slice(150, 261), eintritt: geo[150], austritt: geo[260], hash: "b" } },
    ]
    const rep = lokaleReparatur(geo, wahl, new Map())
    expect(rep.reparaturen.length).toBeGreaterThan(0)
    expect(rep.reparaturen.length).toBeLessThanOrEqual(2)
    expect(rep.reparaturen[0].art).toBe("ueberlappung_beschnitten")
  })
  it("setzt alternativen Kandidaten aus der Bestenliste ein", () => {
    const s0 = { abschnittId: "S0", startIdx: 100, endIdx: 140 }
    const schlecht = { geometry: [{ lat: 49, lng: 7 }], eintritt: { lat: 49, lng: 7 }, austritt: { lat: 49, lng: 7 }, hash: "weit", kosten: 5 }
    const gut = { geometry: geo.slice(100, 141), eintritt: geo[100], austritt: geo[140], hash: "nah", kosten: 6 }
    const rep = lokaleReparatur(geo, [{ abschnitt: s0, kandidat: schlecht }], new Map([["S0", [schlecht, gut]]]))
    expect(rep.wahl[0].kandidat.hash).toBe("nah")
  })
})

describe("Bewertung & Bestenlisten", () => {
  it("Malus je ungelöster Stelle (Regel 33)", () => {
    const wahl = [{ kandidat: { kosten: 10 } }, { kandidat: { kosten: 20 } }]
    expect(bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: 0 })).toBe(30)
    expect(bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: 2 })).toBe(30 + 2 * MALUS_PRO_UNGELOESTE_STELLE)
  })
  it("Bestenliste Tier-primär, dann Kosten (Regel 17/32)", () => {
    const bl = new Map()
    aktualisiereBestenliste(bl, "S0", [
      { hash: "x", kosten: 10, tier: "A" },
      { hash: "y", kosten: 10, tier: "C" },
      { hash: "z", kosten: 8, tier: "A" },
    ])
    const liste = bl.get("S0")
    expect(liste[0].hash).toBe("y") // höchste Tier C gewinnt, obwohl teurer als z
    expect(liste[1].hash).toBe("z") // innerhalb Tier A billiger zuerst
  })
})

describe("rundenHash & tierVerteilung", () => {
  it("gleiche Kandidaten → gleicher Hash", () => {
    const r1 = [{ abschnittId: "S0", kandidaten: [{ hash: "a" }, { hash: "b" }] }]
    const r3 = [{ abschnittId: "S0", kandidaten: [{ hash: "a" }, { hash: "c" }] }]
    expect(rundenHash(r1)).toBe(rundenHash(structuredClone(r1)))
    expect(rundenHash(r1)).not.toBe(rundenHash(r3))
  })
  it("summiert km nach Tier", () => {
    expect(tierVerteilung([
      { kandidat: { tier: "A", distanzKm: 3 } },
      { kandidat: { tier: "A", distanzKm: 2 } },
      { kandidat: { tier: "C", distanzKm: 4 } },
    ])).toEqual({ A_km: 5, B_km: 0, C_km: 4 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Harness (roadmapOrchestrator.js) — Phasen-Workflow
// ─────────────────────────────────────────────────────────────────────────────

describe("Roadmap-Orchestrator — Workflow", () => {
  const geo = gerade(50)
  const baue = (init, subFn, valFn) =>
    createRoadmapOrchestrator({ routing: stubRouting(init), subAgent: stubSubAgent(subFn), validator: stubValidator(valFn) })

  it("Phase 0: unvollständiger Auftrag → AuftragUnvollstaendig, keine Defaults", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50 })
    await expect(orch.plane({ start: "A", ziel: "B" })).rejects.toBeInstanceOf(AuftragUnvollstaendig)
    try {
      await orch.plane({ ...auftrag(), fahrzeugprofil: { hoehe: 4 } })
    } catch (e) {
      expect(e.fehlende).toContain("fahrzeugprofil.achslast")
    }
  })

  it("Phase 1: keine durchgehende Route → nicht_befahrbar mit route null", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, durchgehend: false, sperrstelle: { ort: geo[100], typ: "sperrung" } })
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("nicht_befahrbar")
    expect(r.route).toBeNull()
  })

  it("Regel 8: keine kritischen Stellen → vollstaendig_geloest", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [] })
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.verbrauchte_runden).toBe(0)
  })

  it("Regel 9: alle Stellen 'keine' (Hindernis) → initialstrecke ohne Sub-Agenten", async () => {
    const spy = vi.fn()
    const orch = createRoadmapOrchestrator({
      routing: stubRouting({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, { modus: "keine" })] }),
      subAgent: { bearbeite: spy },
      validator: stubValidator(),
    })
    const r = await orch.plane(auftrag({ umfahrungsmodusGlobal: "keine" }))
    expect(r.status).toBe("initialstrecke")
    expect(r.ungeloeste_stellen).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it("Regel 9 Sonderfall: Sperre auf 'keine' → nicht_befahrbar (nicht initialstrecke)", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, { modus: "keine", klasse: KLASSE.SPERRE })] })
    const r = await orch.plane(auftrag({ umfahrungsmodusGlobal: "keine" }))
    expect(r.status).toBe("nicht_befahrbar")
  })

  it("löst eine Stelle in Runde 1 vollständig", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250)] })
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.abbruchgrund).toBe("geloest")
    expect(r.verbrauchte_runden).toBe(1)
    expect(r.ungeloeste_stellen).toEqual([])
    expect(r.tier_verteilung.A_km).toBeGreaterThan(0)
  })

  it("Ablehnung verbraucht eine Runde, dann Freigabe", async () => {
    let n = 0
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250)] }, undefined, () => ({ freigabe: ++n >= 2 }))
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.verbrauchte_runden).toBe(2)
  })

  it("Regel 12: nur beanstandete Abschnitte werden neu beauftragt, akzeptierte wiederverwendet", async () => {
    const calls = {}
    let v = 0
    const orch = baue(
      { geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 100), stelle(geo, 400)] },
      (a) => {
        calls[a.abschnittId] = (calls[a.abschnittId] ?? 0) + 1
        return { abschnittId: a.abschnittId, geloest: true, kandidaten: [bogenKandidat(a)] }
      },
      () => (++v === 1 ? { freigabe: false, beanstandeteAbschnitte: ["S1"] } : { freigabe: true }),
    )
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("vollstaendig_geloest")
    expect(r.verbrauchte_runden).toBe(2)
    expect(calls.S0).toBe(1) // akzeptiert → nur einmal beauftragt
    expect(calls.S1).toBe(2) // beanstandet → in Runde 2 erneut
  })

  it("Verbot: 'hart' wird NIE zu 'weich' — auch nicht in den weichen Runden 3–5", async () => {
    const modi = []
    const klassen = []
    const orch = baue(
      { geometry: geo, distanzKm: 50, harteSperreVorhanden: true, kritischeStellen: [stelle(geo, 250, { klasse: KLASSE.SPERRE })] },
      (a) => {
        modi.push(a.modus)
        klassen.push(a.rundenParameter.strassenklasse)
        return { abschnittId: a.abschnittId, geloest: false, kandidaten: [bogenKandidat(a)] }
      },
      () => ({ freigabe: false }),
    )
    const r = await orch.plane(auftrag())
    expect(r.verbrauchte_runden).toBe(5)
    expect(r.abbruchgrund).toBe("budget")
    expect(modi.every((m) => m === "hart")).toBe(true)
    expect(klassen).toContain("weich")
    expect(r.status).toBe("nicht_befahrbar") // harte Sperre, nie eine Umfahrung akzeptiert
  })

  it("Regel 19: identische Kandidaten zweier Runden → Konvergenz-Abbruch", async () => {
    const fix = (a) => ({ geometry: geo.slice(a.startIdx, a.endIdx + 1), eintritt: geo[a.startIdx], austritt: geo[a.endIdx], kosten: 7, distanzKm: 4, tier: "A" })
    const orch = baue(
      { geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250, { klasse: KLASSE.HINDERNIS })] },
      (a) => ({ abschnittId: a.abschnittId, geloest: false, kandidaten: [fix(a)] }),
      () => ({ freigabe: false }),
    )
    const r = await orch.plane(auftrag())
    expect(r.abbruchgrund).toBe("konvergenz")
    expect(r.verbrauchte_runden).toBe(2)
  })

  it("Regel 35: harte Sperre ohne Umfahrung → nicht_befahrbar, route null", async () => {
    const orch = baue(
      { geometry: geo, distanzKm: 50, harteSperreVorhanden: true, kritischeStellen: [stelle(geo, 250, { klasse: KLASSE.SPERRE })] },
      (a) => ({ abschnittId: a.abschnittId, geloest: false, kandidaten: [] }),
      () => ({ freigabe: false }),
    )
    const r = await orch.plane(auftrag())
    expect(r.status).toBe("nicht_befahrbar")
    expect(r.route).toBeNull()
    expect(r.ungeloeste_stellen[0].modus).toBe("hart")
  })

  it("meldet abschnitte_ohne_kurvenpruefung", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250)] }, (a) => ({
      abschnittId: a.abschnittId, geloest: true, kurvengeprueft: false, kandidaten: [bogenKandidat(a)],
    }))
    const r = await orch.plane(auftrag())
    expect(r.abschnitte_ohne_kurvenpruefung.length).toBe(1)
  })

  it("liefert die vollständige Spec-Rückgabeform (Regel 37)", async () => {
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250)] })
    const r = await orch.plane(auftrag())
    expect(Object.keys(r).sort()).toEqual(
      ["abbruchgrund", "abschnitte_ohne_kurvenpruefung", "reparaturen", "route", "status", "tier_verteilung", "ungeloeste_stellen", "verbrauchte_runden"].sort(),
    )
    expect(r.tier_verteilung).toMatchObject({ A_km: expect.any(Number), B_km: expect.any(Number), C_km: expect.any(Number) })
  })

  it("Sub-Agent bekommt NUR seinen Abschnitt + Rundenparameter + Zeitfenster (nie die Gesamtstrecke)", async () => {
    let gesehen = null
    const orch = baue({ geometry: geo, distanzKm: 50, kritischeStellen: [stelle(geo, 250)] }, (a) => {
      gesehen = a
      return { abschnittId: a.abschnittId, geloest: true, kandidaten: [bogenKandidat(a)] }
    })
    await orch.plane(auftrag())
    expect(gesehen.abschnitt.length).toBeLessThan(geo.length)
    expect(gesehen).not.toHaveProperty("gesamtstrecke")
    expect(gesehen.rundenParameter.zeitdeckelMin).toBe(RUNDEN_TABELLE[0].zeitdeckelMin)
    expect(gesehen.kontext.zeitfenster).toBeDefined()
    expect(gesehen.modus).toBe("hart")
  })
})
