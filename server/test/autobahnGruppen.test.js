// T-609: Autobahn-Bauphasen — Phasen DERSELBEN Maßnahme mit UNTERSCHIEDLICHER Restbreite dürfen nicht
// zu EINEM Fund mit Minimum-Restbreite verschmelzen (sonst falsch-kritisch + Widerspruch Text↔Restbreite).
import { describe, expect, it } from "vitest"
import { gruppiereStrecken } from "../src/connectors/autobahn.js"

const seg = (over = {}) => ({
  _pk: "2025-009385", _ri: "Ulm -> Füssen/Reutte", kategorie: "baustelle",
  name: "A7 | Buchwald - Buchenberg", beschreibung: "…", lat: 47.7, lng: 10.3,
  externeId: "x", strassenRef: "A7", attrs: { restbreiteM: 5.85, spurenGesperrt: 3 }, geom: null,
  kiAufbereitet: true, quelle: { name: "Autobahn GmbH · A7" },
  gueltigVon: "2026-07-06", gueltigBis: "2026-11-23", ...over,
})

describe("gruppiereStrecken — Bauphasen-Trennung nach Restriktions-Profil (T-609)", () => {
  it("gleiche Projekt-Nr., VERSCHIEDENE Restbreite → getrennte Funde (kein Min-Leak)", () => {
    const out = gruppiereStrecken([
      seg({ attrs: { restbreiteM: 5.85, spurenGesperrt: 3 } }),
      seg({ gueltigVon: "2026-07-03", attrs: { restbreiteM: 3.5, spurenGesperrt: 3 } }),
    ])
    expect(out).toHaveLength(2)
    expect(out.map((o) => o.attrs.restbreiteM).sort()).toEqual([3.5, 5.85])
  })

  it("räumliche Teilstücke GLEICHEN Profils (gleiche/ohne Maße) → eine Strecke", () => {
    const sp = (lng, over = {}) => seg({ attrs: { fahrbahnVerengt: true }, geom: { type: "LineString", coordinates: [[lng, 47.7], [lng + 0.01, 47.71]] }, ...over })
    const out = gruppiereStrecken([sp(10.30), sp(10.32), sp(10.34)])
    expect(out).toHaveLength(1)
    expect(out[0].geom.type).toBe("MultiLineString")
  })
})
