// T-609: Autobahn-Bauphasen — zeitversetzte Phasen DERSELBEN Maßnahme dürfen nicht zu EINEM Fund mit
// Minimum-Restbreite verschmelzen (sonst falsch-kritisch + Widerspruch Text↔Restbreite).
import { describe, expect, it } from "vitest"
import { gruppiereStrecken } from "../src/connectors/autobahn.js"

const seg = (over = {}) => ({
  _pk: "2025-009385", _ri: "Ulm -> Füssen/Reutte", kategorie: "baustelle",
  name: "A7 | Buchwald - Buchenberg", beschreibung: "…", lat: 47.7, lng: 10.3,
  strassenRef: "A7", attrs: { restbreiteM: 5.85, spurenGesperrt: 3 }, geom: null,
  kiAufbereitet: true, quelle: { name: "Autobahn GmbH · A7" },
  gueltigVon: "2026-07-06", gueltigBis: "2026-11-23", ...over,
})

describe("gruppiereStrecken — Bauphasen-Trennung (T-609)", () => {
  it("gleiche Projekt-Nr., VERSCHIEDENE Zeitfenster → getrennte Funde mit EIGENER Restbreite", () => {
    const out = gruppiereStrecken([
      seg({ gueltigVon: "2026-07-06", attrs: { restbreiteM: 5.85, spurenGesperrt: 3 } }), // breit
      seg({ gueltigVon: "2026-07-03", attrs: { restbreiteM: 3.5, spurenGesperrt: 3 } }),  // schmal, andere Phase
    ])
    expect(out).toHaveLength(2)
    expect(out.map((o) => o.attrs.restbreiteM).sort()).toEqual([3.5, 5.85]) // keine Min-Leakage
  })

  it("räumliche Teilstücke DERSELBEN Phase (gleiches Zeitfenster) → ein Fund, Min-Restbreite", () => {
    const out = gruppiereStrecken([
      seg({ attrs: { restbreiteM: 5.85, spurenGesperrt: 3 }, geom: { type: "LineString", coordinates: [[10.3, 47.7], [10.31, 47.71]] } }),
      seg({ attrs: { restbreiteM: 4.0, spurenGesperrt: 3 }, geom: { type: "LineString", coordinates: [[10.31, 47.71], [10.32, 47.72]] } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attrs.restbreiteM).toBe(4.0) // engste Stelle der Phase bindet
  })
})
