// T-609: dedupeObstacles trennt Stellen mit unterschiedlichem Restriktions-Profil (Bauphasen), mergt
// aber gleiches Profil (Nacht-Teilstücke) — kein Min-Restbreite-Leak über verschiedene Breiten.
import { describe, expect, it } from "vitest"
import { dedupeObstacles, restriktionsProfil } from "../src/connectors/_helpers.js"

const o = (over = {}) => ({
  kategorie: "baustelle", name: "A7 | Buchwald - Buchenberg", lat: 47.700, lng: 10.300,
  attrs: { restbreiteM: 5.85 }, gueltigVon: "2026-07-06", gueltigBis: "2026-11-23", ...over,
})

describe("dedupeObstacles — Bauphasen nach Profil (T-609)", () => {
  it("gleiche Stelle, VERSCHIEDENE Restbreite → getrennte Funde mit eigener Restbreite + ID", () => {
    const out = dedupeObstacles([
      o({ attrs: { restbreiteM: 5.85 } }),
      o({ attrs: { restbreiteM: 5.5 } }),
      o({ attrs: { restbreiteM: 3.5 } }),
    ])
    expect(out).toHaveLength(3)
    expect(out.map((x) => x.attrs.restbreiteM).sort()).toEqual([3.5, 5.5, 5.85])
    expect(new Set(out.map((x) => x.externeId)).size).toBe(3)
  })

  it("gleiche Stelle, GLEICHES Profil → ein Fund (Nacht-Teilstücke)", () => {
    const out = dedupeObstacles([
      o({ attrs: { restbreiteM: 4.0 } }),
      o({ attrs: { restbreiteM: 4.0 }, gueltigVon: "2026-07-07" }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attrs.restbreiteM).toBe(4.0)
  })

  it("restriktionsProfil unterscheidet Breiten, ignoriert Zeitfenster", () => {
    expect(restriktionsProfil({ restbreiteM: 5.85 })).not.toBe(restriktionsProfil({ restbreiteM: 3.5 }))
    expect(restriktionsProfil({ restbreiteM: 4.0 })).toBe(restriktionsProfil({ restbreiteM: 4.0 }))
  })
})
