// 0218 Bonn — neuer Abrufweg ueber die GDI Bonn (gdi.bonn.de/geoserver), nachdem
// stadtplan.bonn.de abgeschaltet wurde.
//
// Zwei Dinge muessen hier sitzen, beide an echten Quellwerten kalibriert (06.09.2026):
//   1. der Sperrgrad — fuer den Schwertransport zaehlt allein die Fahrbahn
//   2. der Retry — der Loadbalancer der Stadt beantwortet rund die Haelfte aller Aufrufe mit
//      HTTP 400 "Feature type unknown"; ohne Wiederholung faellt jeder zweite Import aus
import { describe, it, expect, vi, afterEach } from "vitest"
import { baueBonnObstacles, bonnBaustellenGdiConnector as conn } from "../src/connectors/0218_bonn_baustellen_gdi.js"

const sach = (props, lng = 7.1, lat = 50.73) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: {
    baustelle_id: 1, bezeichnung: "Teststraße", adresse: "Teststraße 1",
    von: "01.06.2026", bis: "22.12.2027", traeger: "Bundesstadt Bonn", massnahme: "Kanalbau",
    sperrung: "keine Sperrung", ...props,
  },
})

const flaeche = (baustelleId, props = {}) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[7.1, 50.73], [7.101, 50.731], [7.102, 50.73], [7.1, 50.73]]] },
  properties: { baustelle_id: baustelleId, ...props },
})

afterEach(() => vi.restoreAllMocks())

describe("0218 Bonn — Sperrgrad aus dem Quellfeld", () => {
  it("wertet nur die Fahrbahn als Sperrung; Geh-/Radweg und Teilsperrung bleiben Baustelle", () => {
    const out = baueBonnObstacles([
      sach({ baustelle_id: 1, sperrung: "keine Sperrung" }),
      sach({ baustelle_id: 2, sperrung: "Vollsperrung der Fahrbahn" }),
      sach({ baustelle_id: 3, sperrung: "Teilsperrung von Fahrbahn und Gehweg" }),
      sach({ baustelle_id: 4, sperrung: "Sperrung einer Fahrtrichtung" }),
      sach({ baustelle_id: 5, sperrung: "Vollsperrung des Geh- und Radwegs" }),
    ])
    const nach = (id) => out.find((o) => o.externeId.startsWith(`${id}#`))

    expect(nach(1).kategorie).toBe("baustelle")
    expect(nach(1).attrs.vollsperrung).toBe(false)

    expect(nach(2).kategorie).toBe("sperrung")
    expect(nach(2).attrs.vollsperrung).toBe(true)

    // Teilsperrung: der Transport kommt an der Fahrbahn vorbei → keine Sperrung, kein Kritisch.
    expect(nach(3).kategorie).toBe("baustelle")
    expect(nach(3).attrs.vollsperrung).toBe(false)

    // Eine Fahrtrichtung dicht ist eine echte Sperrung, aber keine Vollsperrung.
    expect(nach(4).kategorie).toBe("sperrung")
    expect(nach(4).attrs.vollsperrung).toBe(false)

    // Der Kern: "Vollsperrung des Geh- und Radwegs" darf KEIN Fahrbahn-Kritisch werden — weder
    // ueber die Kategorie noch ueber den Freitext-Nachzug in makeNormalized (T-611).
    expect(nach(5).kategorie).toBe("baustelle")
    expect(nach(5).attrs.vollsperrung).toBe(false)
  })

  it("laesst die Freitext-Heuristik nur ran, wenn die Quelle den Grad selbst offen laesst", () => {
    const [o] = baueBonnObstacles([sach({ sperrung: "", massnahme: "Vollsperrung wegen Kanalbau" })])
    expect(o.attrs.vollsperrung).toBe(true) // aus dem Beschreibungstext nachgezogen
    expect(o.kiAufbereitet).toBe(true)
  })

  it("flaggt Fahrbahnsanierung NICHT als Bahnbaustelle", () => {
    // "Fahrbahnsanierung" enthaelt "bahn" — 4 Eintraege im echten Bestand liefen darauf auf.
    const [fahrbahn] = baueBonnObstacles([sach({ massnahme: "Fahrbahnsanierung" })])
    expect(fahrbahn.attrs.bahnbaustelle).toBeUndefined()
    const [gleis] = baueBonnObstacles([sach({ massnahme: "Gleisbau" })])
    expect(gleis.attrs.bahnbaustelle).toBe(true)
  })
})

describe("0218 Bonn — Flaechen-Join und Schluessel", () => {
  it("haengt die Baustellenflaeche ueber baustelle_id an und uebernimmt die Umleitung", () => {
    const out = baueBonnObstacles(
      [sach({ baustelle_id: 42 }), sach({ baustelle_id: 43 })],
      [flaeche(42, { umleitung_vorhanden: true })],
    )
    const mit = out.find((o) => o.externeId.startsWith("42#"))
    const ohne = out.find((o) => o.externeId.startsWith("43#"))
    expect(mit.geom.type).toBe("Polygon")
    expect(mit.attrs.umleitung).toBe(true)
    expect(ohne.geom).toBeNull()
    // Ohne Flaeche keine Aussage ueber die Umleitung — kein stilles false.
    expect(ohne.attrs.umleitung).toBeUndefined()
  })

  it("haelt zwei Meldungen mit derselben baustelle_id auseinander und bleibt lauf-stabil", () => {
    const roh = [
      sach({ baustelle_id: 7, sperrung: "Vollsperrung der Fahrbahn" }, 7.10, 50.73),
      sach({ baustelle_id: 7, sperrung: "keine Sperrung" }, 7.12, 50.74),
    ]
    const a = baueBonnObstacles(roh)
    const b = baueBonnObstacles(roh)
    expect(new Set(a.map((o) => o.externeId)).size).toBe(2) // kein Upsert-Kollaps
    expect(a.map((o) => o.externeId)).toEqual(b.map((o) => o.externeId)) // kein Reconcile-Flattern
  })
})

describe("0218 Bonn — Abruf gegen den wackeligen Loadbalancer", () => {
  const antwort = (features) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ type: "FeatureCollection", numberMatched: features.length, features }),
  })
  const vierhundert = { ok: false, status: 400, headers: { get: () => "application/xml" }, text: async () => "<ows:ExceptionReport/>" }

  it("wiederholt den HTTP-400 und liefert den Bestand", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(vierhundert)
      .mockResolvedValueOnce(vierhundert)
      .mockResolvedValueOnce(antwort([sach({ baustelle_id: 9 })]))
      .mockResolvedValueOnce(vierhundert)
      .mockResolvedValueOnce(antwort([flaeche(9)]))
    const { obstacles } = await conn.fetch({})
    expect(f).toHaveBeenCalledTimes(5)
    expect(obstacles).toHaveLength(1)
    expect(obstacles[0].geom.type).toBe("Polygon")
  })

  it("wirft, statt einen leeren Bestand zu melden — sonst raeumt der Reconcile Bonn leer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vierhundert)
    await expect(conn.fetch({})).rejects.toThrow(/nicht ladbar/)
  })

  it("nimmt eine abgeschnittene Antwort nicht als Bestand", async () => {
    const halb = {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ type: "FeatureCollection", numberMatched: 64, features: [sach({ baustelle_id: 9 })] }),
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(halb)
    await expect(conn.fetch({})).rejects.toThrow(/nicht ladbar/)
  })
})
