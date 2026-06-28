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

// T-610: Eintags-Fenster ohne separates Ende-Datum bekommt gueltig_bis = der Tag (sonst nie ablaufend).
import { normalizeAutobahn } from "../src/connectors/autobahn.js"
describe("endeAusBeschreibung — Eintags-Fenster (T-610)", () => {
  const item = (desc) => ({
    identifier: "2026-111111--vi-bs.2026-07-02_07-00-00-000.de1", title: "A7 | X - Y", subtitle: "Nord",
    startTimestamp: "2026-07-02T07:00:00.000+0200", coordinate: { lat: "48.1", long: "9.5" },
    description: desc, geometry: { type: "LineString", coordinates: [[9.5, 48.1], [9.51, 48.11]] },
  })
  it("'gültig: 02.07.26 von 07:00 bis 17:00 Uhr' → gueltigBis = 2026-07-02", () => {
    const o = normalizeAutobahn(item(["Die Baustelle ist zu folgenden Zeiträumen gültig: 02.07.26 von 07:00 bis 17:00 Uhr"]), "A7", "roadworks", "u")
    expect(o.gueltigBis).toBe("2026-07-02")
  })
  it("Mehrtages-Zeitraum (zwei Daten) NICHT als Eintag → gueltigBis aus 'Ende'", () => {
    const o = normalizeAutobahn(item(["gültig: 02.07.26 bis 17.07.26", "Ende: 17.07.26 um 08:00 Uhr"]), "A7", "roadworks", "u")
    expect(o.gueltigBis).toBe("2026-07-17")
  })
})
