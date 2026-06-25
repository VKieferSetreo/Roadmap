import { describe, expect, it } from "vitest"
import { parseVmzNiFeatures } from "../src/connectors/0158_vmz_ni_baustellen.js"

const feat = (props) => ({
  type: "Feature",
  properties: { centroid: { x: 9.7, y: 52.4 }, ...props },
  geometry: { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [9.7, 52.4] }] },
})

describe("VMZ-NI Connector 0158 — innerorts-only, Dedup gegen 0140, kein Live-Verkehr (T-566)", () => {
  it("emittiert nur innerorts-Bau-Funde; A/B/L + Live-Verkehr raus", () => {
    const out = parseVmzNiFeatures([
      feat({ id: "a", name: "A1 Bremen → Osnabrück", roadNumber: "A1", mapsightIconId: "baustelle" }), // A/B/L → 0140-Dup, raus
      feat({ id: "b", name: "B6 bei Hannover", roadNumber: "B6", mapsightIconId: "baustelle" }), // B → raus
      feat({ id: "c", name: "Braunschweig, K2 zwischen …", roadNumber: "K2", mapsightIconId: "baustelle" }), // K → drin
      feat({ id: "d", name: "Achim, Bahnhofstraße", roadNumber: "", mapsightIconId: "vollsperrung" }), // innerorts Sperrung → drin
      feat({ id: "e", name: "Hannover Innenstadt", roadNumber: "", mapsightIconId: "stau" }), // Live-Verkehr → raus
      feat({ id: "f", name: "Göttingen", roadNumber: "", mapsightIconId: "meldung" }), // Live-Verkehr → raus
      feat({ id: "g", name: "Osnabrück, Lindenweg zwischen B68 und Hauptstraße", roadNumber: "", mapsightIconId: "fahrbahnverengung" }), // innerorts, nennt B68 nur als Landmarke → drin, aber NICHT als B68 labeln
    ])
    const ids = out.map((o) => o.externeId).sort()
    expect(ids).toEqual(["ni-c", "ni-d", "ni-g"])

    const d = out.find((o) => o.externeId === "ni-d")
    expect(d.kategorie).toBe("sperrung")
    expect(d.attrs?.vollsperrung).toBe(true)
    const c = out.find((o) => o.externeId === "ni-c")
    expect(c.kategorie).toBe("baustelle")
    expect(c.strassenRef).toBe("K2")
    // innerorts-Straße, die eine B-Straße nur als Landmarke nennt → NICHT als „B68" labeln (sonst
    // Fehl-Bezug + Verwechslung mit 0140). Eigener Straßennamen-Parse blockt makeNormalized-Extraktion.
    const g = out.find((o) => o.externeId === "ni-g")
    expect(g.strassenRef).toBe("Lindenweg")
    expect(g.strassenRef).not.toMatch(/^[ABL]\d/)
    // keine Maße aus Freitext (extractStammdaten-Schutz): kein hoehe/breite/gewicht gesetzt
    expect(c.attrs?.maxHoeheM ?? c.attrs?.breite ?? c.attrs?.maxGewichtT ?? null).toBeNull()
  })

  it("leeres/ungültiges Feed → keine Funde, kein Crash", () => {
    expect(parseVmzNiFeatures([])).toEqual([])
    expect(parseVmzNiFeatures(null)).toEqual([])
    // Feature ohne Koordinaten wird übersprungen
    expect(parseVmzNiFeatures([{ properties: { id: "x", mapsightIconId: "baustelle", roadNumber: "K1" }, geometry: null }])).toEqual([])
  })
})
