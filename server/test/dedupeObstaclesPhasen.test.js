// T-609: dedupeObstacles darf zeitversetzte Bauphasen DERSELBEN Stelle nicht zu Min-Restbreite mergen.
import { describe, expect, it } from "vitest"
import { dedupeObstacles } from "../src/connectors/_helpers.js"

const o = (over = {}) => ({
  kategorie: "baustelle", name: "A7 | Buchwald - Buchenberg", lat: 47.700, lng: 10.300,
  attrs: { restbreiteM: 5.85 }, gueltigVon: "2026-07-06", gueltigBis: "2026-11-23", ...over,
})

describe("dedupeObstacles — Bauphasen (T-609)", () => {
  it("3 Phasen gleicher Stelle, versch. Zeitfenster → 3 Funde mit EIGENER Restbreite (kein Min-Merge)", () => {
    const out = dedupeObstacles([
      o({ gueltigVon: "2026-07-06", gueltigBis: "2026-11-23", attrs: { restbreiteM: 5.85 } }),
      o({ gueltigVon: "2026-03-12", gueltigBis: "2026-07-03", attrs: { restbreiteM: 5.5 } }),
      o({ gueltigVon: "2026-07-03", gueltigBis: "2026-07-06", attrs: { restbreiteM: 3.5 } }),
    ])
    expect(out).toHaveLength(3)
    expect(out.map((x) => x.attrs.restbreiteM).sort()).toEqual([3.5, 5.5, 5.85])
    expect(new Set(out.map((x) => x.externeId)).size).toBe(3) // eindeutige IDs je Phase
  })

  it("gleiche Stelle, GLEICHES Zeitfenster → ein Fund, Min-Restbreite (engste Stelle)", () => {
    const out = dedupeObstacles([
      o({ attrs: { restbreiteM: 5.85 } }),
      o({ attrs: { restbreiteM: 4.0 } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attrs.restbreiteM).toBe(4.0)
  })
})
