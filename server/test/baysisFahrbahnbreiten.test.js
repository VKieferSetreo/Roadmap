// BAYSIS Fahrbahnbreiten (0234): ASB-Querschnitt → Engstelle je Station.
// Der Kern ist die Gruppierung: schmal ist nicht die Station, sondern ein Querschnitt-ELEMENT.
// Liegt an der Station nur eine Haelfte im Abzug, ist die andere breiter als die Grenze und der
// Transport kommt vorbei — ohne diesen Test kaeme 13-16 % Falsch-Kritisch zurueck.
import { afterEach, describe, expect, it, vi } from "vitest"
import { baysisFahrbahnbreitenConnector as conn } from "../src/connectors/0234_baysis_fahrbahnbreiten.js"

/** Ein Querschnitt-Element. xl/xr sind die X-Werte zur Strassenachse, bis* nur bei Verjuengung. */
const el = ({
  strasse = "St 2510",
  klasse = "St",
  vnk = "7630003O",
  nnk = "7630005O",
  ast = null,
  von = 1.721,
  bis = 1.727,
  breite,
  bisBreite = null,
  xl,
  xr,
  bisXl = null,
  bisXr = null,
  lng = 11.5,
  lat = 48.25,
}) => ({
  type: "Feature",
  geometry: { type: "MultiPolygon", coordinates: [[[[lng, lat], [lng + 0.0001, lat], [lng, lat + 0.0001], [lng, lat]]]] },
  properties: {
    "Straßenbezeichnung": strasse,
    "Straßenklasse": klasse,
    VNK: vnk,
    NNK: nnk,
    Ast: ast,
    "Von-Station_": von,
    "Bis-Station_": bis,
    "Von-Breite__cm__": breite,
    "Bis-Breite__cm__": bisBreite ?? breite,
    "Linker_X-Wert_an_der_Von-Station": xl,
    "Rechter_X-Wert_an_der_Von-Station": xr,
    "Linker_X-Wert_an_der_Bis-Station": bisXl ?? xl,
    "Rechter_X-Wert_an_der_Bis-Station": bisXr ?? xr,
    Layerdatum_: "06.09.2026 05:24:44",
  },
})

const mockFeed = (features) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ type: "FeatureCollection", numberMatched: features.length, features }),
  })

afterEach(() => vi.restoreAllMocks())

describe("BAYSIS Fahrbahnbreiten 0234", () => {
  it("fasst die zwei Haelften einer geteilten Fahrbahn zu EINER Engstelle zusammen", async () => {
    // St 2510 bei km 1,721: 3,50 m | Querungshilfe | 3,50 m (echter Querschnitt der Quelle).
    mockFeed([
      el({ breite: 3.5, xl: -4.45, xr: -0.95 }),
      el({ breite: 3.5, xl: 0.95, xr: 4.45 }),
    ])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })

    expect(obstacles).toHaveLength(1)
    const o = obstacles[0]
    expect(o.kategorie).toBe("engstelle")
    expect(o.name).toBe("Fahrbahnteilung 3,50 m — St 2510")
    expect(o.attrs.maxBreiteM).toBe(3.5)
    // restbreiteM waere die Restbreite einer BAUSTELLE — hier steht gebaute Strasse.
    expect(o.attrs.restbreiteM).toBeUndefined()
    expect(o.strassenRef).toBe("St2510")
    expect(o.kiAufbereitet).toBe(false)
    expect(o.gueltigVon).toBeNull()
    expect(o.gueltigBis).toBeNull()
  })

  it("verwirft die Station, wenn nur EINE Haelfte schmal ist (Gegenseite bleibt befahrbar)", async () => {
    mockFeed([el({ breite: 3.0, xl: 0.95, xr: 3.95 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(0)
  })

  it("nimmt die ungeteilte, achsenueberspannende Fahrbahn und den breitesten Streifen", async () => {
    mockFeed([
      el({ strasse: "K WÜ 17", klasse: "K", breite: 4.4, xl: -2.2, xr: 2.2 }),
      // gleiche Station, zweites schmaleres Element → der BREITESTE bestimmt, was durchpasst
      el({ strasse: "K WÜ 17", klasse: "K", breite: 3.0, xl: -1.5, xr: 1.5 }),
    ])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(1)
    expect(obstacles[0].name).toBe("Fahrbahnbreite 4,40 m — K WÜ 17")
    expect(obstacles[0].attrs.maxBreiteM).toBe(4.4)
    expect(obstacles[0].strassenRef).toBe("WÜ17") // bayerische Kreisstrasse wie in 0147
  })

  it("wertet eine sich verjuengende Fahrbahn am schmalen Ende", async () => {
    mockFeed([el({ breite: 6.0, bisBreite: 4.2, xl: -3.0, xr: 3.0, bisXl: -2.1, bisXr: 2.1 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(1)
    expect(obstacles[0].attrs.maxBreiteM).toBe(4.2)
  })

  it("verwirft breite Fahrbahnen, deren Gegenende nicht erfasst ist (Bis-Breite 0)", async () => {
    mockFeed([el({ breite: 6.0, bisBreite: 0, xl: -3.0, xr: 3.0 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(0)
  })

  it("verwirft unplausible Erfassungsluecken (1,00 m mit Achsen-Default)", async () => {
    mockFeed([el({ strasse: "B 8", klasse: "B", breite: 1.0, xl: -0.5, xr: 0.5 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(0)
  })

  it("haelt den Buchstaben-Suffix im Netz-Kennzeichen (B 16 A ist nicht die B 16)", async () => {
    mockFeed([el({ strasse: "B 16 A", klasse: "B", breite: 3.75, xl: -1.875, xr: 1.875 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles[0].strassenRef).toBe("B16A")
    expect(obstacles[0].kiAufbereitet).toBe(false)
  })

  it("haengt eine Gemeindestrasse nicht an die Autobahn", async () => {
    // "G A 210" ist eine Gemeindestrasse im Landkreis Aschaffenburg. Stuende sie im Titel, laese
    // die Freitext-Extraktion daraus "A210".
    mockFeed([el({ strasse: "G A 210", klasse: "G", breite: 3.5, xl: -1.75, xr: 1.75 })])
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(1)
    expect(obstacles[0].strassenRef).toBeNull()
    expect(obstacles[0].name).toBe("Fahrbahnbreite 3,50 m — Gemeindestraße")
    expect(obstacles[0].roh.Strassenbezeichnung).toBe("G A 210")
  })

  it("wirft bei leerem Abzug, statt den Bestand abraeumen zu lassen", async () => {
    mockFeed([])
    await expect(conn.fetch({ timeoutMs: 1000 })).rejects.toThrow(/0 Fahrbahn-Elemente/)
  })

  it("vergibt je Station eine stabile, eindeutige externeId", async () => {
    mockFeed([
      el({ breite: 3.5, xl: -4.45, xr: -0.95 }),
      el({ breite: 3.5, xl: 0.95, xr: 4.45 }),
      el({ von: 2.1, bis: 2.14, breite: 3.5, xl: -1.75, xr: 1.75 }),
    ])
    const a = await conn.fetch({ timeoutMs: 1000 })
    const b = await conn.fetch({ timeoutMs: 1000 })
    expect(a.obstacles).toHaveLength(2)
    expect(new Set(a.obstacles.map((o) => o.externeId)).size).toBe(2)
    expect(b.obstacles.map((o) => o.externeId)).toEqual(a.obstacles.map((o) => o.externeId))
  })
})
