// T-626 Data-Quality-Audit — Fixes: dateOnly-Slash-Format (0215 Münster) + Staleness-Monitor-Klassifikation.
import { describe, it, expect } from "vitest"
import { dateOnly } from "../src/connectors/_helpers.js"
import { detectStaleSources } from "../src/worker/hygiene.js"

describe("dateOnly — Slash-Format (T-626, Münster-Feed 0215)", () => {
  it("parst YYYY/MM/DD [HH:MM:SS] → ISO", () => {
    expect(dateOnly("2026/07/02 00:00:00")).toBe("2026-07-02")
    expect(dateOnly("2026/12/31")).toBe("2026-12-31")
  })
  it("bestehende Formate bleiben unverändert", () => {
    expect(dateOnly("2026-07-02T13:00:00Z")).toBe("2026-07-02")
    expect(dateOnly("02.07.2026")).toBe("2026-07-02")
    expect(dateOnly("02.07.26")).toBe("2026-07-02")
    expect(dateOnly(null)).toBe(null)
    expect(dateOnly("kein Datum")).toBe(null)
  })
})

describe("detectStaleSources — Grund-Klassifikation (T-626)", () => {
  // Stub-DB: liefert kanonische Zeilen, wie sie STALE_SOURCES_SQL zurückgäbe.
  const stubDb = (rows) => ({ query: async () => ({ rows }) })

  it("klassifiziert jedes Signal korrekt", async () => {
    const rows = [
      { id: "0124", name: "NRW GST", last_status: "warn", last_run: "2026-06-29 10:00", age_days: 5, aktiv_n: "156" },
      { id: "0111", name: "HH Brücken", last_status: "ok", last_run: "2026-07-04 06:00", age_days: 0, aktiv_n: "0" },
      { id: "0122", name: "MobiData BW", last_status: "ok", last_run: "2026-06-14 16:00", age_days: 20, aktiv_n: "0" },
      { id: "0009", name: "Nie gelaufen", last_status: null, last_run: null, age_days: null, aktiv_n: "0" },
    ]
    const out = await detectStaleSources(stubDb(rows), { staleDays: 3 })
    const byId = Object.fromEntries(out.map((f) => [f.id, f.grund]))
    expect(byId["0124"]).toBe("letzter Lauf warn")
    expect(byId["0111"]).toBe("0 aktive Hindernisse")
    expect(byId["0009"]).toBe("nie gelaufen")
    // 0122: ok-Lauf, 0 aktiv → "0 aktive Hindernisse" hat Vorrang (aktiv_n===0 vor Alters-Fallback)
    expect(byId["0122"]).toBe("0 aktive Hindernisse")
    expect(out.every((f) => typeof f.aktiv_n === "number")).toBe(true)
  })

  it("leere Liste → keine Flags", async () => {
    const out = await detectStaleSources(stubDb([]), {})
    expect(out).toEqual([])
  })
})
