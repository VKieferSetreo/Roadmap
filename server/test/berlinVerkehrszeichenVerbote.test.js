// Berlin Verkehrszeichen-Verbote (0135): Zeichen 250/251/253 aus der Komma-Liste `vkz_zeiche`,
// EPSG:4326 (kein Reproj). Der Berliner Kataster führt die Schilder OHNE Wert — deshalb nur die
// kategorischen Verbote, deren Grenzwert in der StVO steht.
import { afterEach, describe, expect, it, vi } from "vitest"
import { berlinVerkehrszeichenVerboteConnector as conn } from "../src/connectors/0135_berlin_verkehrszeichen_verbote.js"

const feat = (sdatenid, vkz_zeiche, lng, lat, strasse) => ({
  type: "Feature",
  id: `aa_verkehrszeichen.${sdatenid}`,
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { sdatenid, vkz_zeiche, strasse, bezirk: "Mitte", gilt_von: "2012-03-26", mast_id: `M${sdatenid}` },
})

const fc = {
  type: "FeatureCollection",
  features: [
    feat(1, "250, 1000-03", 13.4, 52.52, "Musterallee"), // Durchfahrt verboten
    feat(2, "253", 13.41, 52.53, "Lastweg"), // Lkw-Verbot
    feat(3, "1040-30, 253", 13.42, 52.54, "Zeitweg"), // Lkw-Verbot mit Zeit-Zusatzzeichen
    feat(4, "251", 13.43, 52.55, "Kraftwagenweg"), // Verbot für Kraftwagen
    feat(5, "262, 265, 264", 13.44, 52.56, "Ohnewert"), // Maß-Zeichen ohne Wert → verworfen
    feat(6, "1253-30", 13.45, 52.57, "Zusatzweg"), // Ziffernfolge im Zusatzzeichen → kein Verbot
    feat(7, "253", null, null, "Ohnegeo"), // ohne Koordinate → verworfen
  ],
}

afterEach(() => vi.restoreAllMocks())

describe("Berlin Verkehrszeichen-Verbote 0135", () => {
  it("nimmt nur exakte Verbots-Zeichen und mappt sie auf die Haus-attrs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })

    // 5 (nur Maß-Zeichen ohne Wert), 6 (1253-30 ist kein Zeichen 253) und 7 (ohne Geo) fallen raus.
    expect(obstacles).toHaveLength(4)
    expect(obstacles.map((o) => o.externeId)).toEqual(["be-vz#1", "be-vz#2", "be-vz#3", "be-vz#4"])

    const z250 = obstacles.find((o) => o.externeId === "be-vz#1")
    expect(z250.kategorie).toBe("sperrung")
    expect(z250.attrs.vollsperrung).toBe(true)
    expect(z250.name).toBe("Durchfahrt verboten für Fahrzeuge aller Art (Zeichen 250) — Musterallee")
    expect(z250.lat).toBeCloseTo(52.52, 5)
    expect(z250.lng).toBeCloseTo(13.4, 5)

    const z251 = obstacles.find((o) => o.externeId === "be-vz#4")
    expect(z251.kategorie).toBe("sperrung")
    expect(z251.attrs.vollsperrung).toBe(true)
  })

  it("Zeichen 253 trägt verkehrsverbotLkwT — und KEIN maxGewichtT aus dem Freitext", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    const z253 = obstacles.find((o) => o.externeId === "be-vz#2")

    expect(z253.kategorie).toBe("gewicht")
    expect(z253.attrs.verkehrsverbotLkwT).toBe(3.5)
    // Der Kern: 253 ist ein rechtliches Verbot, keine physische Traglast. Stünde "3,5 t" im
    // Titel, zöge makeNormalized daraus ein maxGewichtT — und jeder Schwertransport wäre hier
    // fälschlich kritisch. Deshalb steht die Zahl nur in den attrs.
    expect(z253.attrs.maxGewichtT).toBeUndefined()
    expect(z253.name).toBe("Lkw-Durchfahrtsverbot (Zeichen 253) — Lastweg")
    expect(z253.kiAufbereitet).toBe(false)
  })

  it("das Erfassungsdatum wird kein Gültigkeitsbeginn", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => fc })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    const mitZeitZusatz = obstacles.find((o) => o.externeId === "be-vz#3")

    // gilt_von ist das Datum der Katastererfassung. Zusammen mit dem Wort "gilt" aus dem
    // Zusatzzeichen-Hinweis hat extractStammdaten daraus einen Gültigkeitsbeginn gemacht und
    // damit auch realerStart (= fachId-Datum) gesetzt. Ein Schild hat keinen Zeitraum.
    expect(mitZeitZusatz.beschreibung).toContain("Zeitangabe")
    expect(mitZeitZusatz.gueltigVon).toBeNull()
    expect(mitZeitZusatz.gueltigBis).toBeNull()
    expect(mitZeitZusatz.realerStart).toBeNull()
    expect(mitZeitZusatz.roh.gilt_von).toBe("2012-03-26") // für die Anreicherung erhalten
  })
})
