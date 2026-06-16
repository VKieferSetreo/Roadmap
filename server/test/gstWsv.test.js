// GST-WSV (0303): GML-Parsing + defensive Maß-Extraktion aus FURTHERINFO/BENENNUNG.
import { describe, it, expect, vi, afterEach } from "vitest"
import { gstWsvKreuzungsbauwerkeConnector as conn } from "../src/connectors/0303_gst_wsv_kreuzungsbauwerke.js"

const member = (uuid, lat, lng, benennung, info) => `
  <wfs:member><ms:strassen_und_wegebrueckenanlagen gml:id="strassen_und_wegebrueckenanlagen.${uuid}">
    <ms:msGeometry><gml:Point srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>${lat} ${lng}</gml:pos></gml:Point></ms:msGeometry>
    <ms:UUID>${uuid}</ms:UUID>
    <ms:OBJEKT_IDENT_NUMMER>1124310001</ms:OBJEKT_IDENT_NUMMER>
    <ms:BUNDESLAND>Nordrhein-Westfalen</ms:BUNDESLAND>
    <ms:BENENNUNG>${benennung}</ms:BENENNUNG>
    <ms:LIEGT_OBEN_ASW></ms:LIEGT_OBEN_ASW>
    <ms:FURTHERINFO>${info}</ms:FURTHERINFO>
    <ms:VERANTWORTLICHER>48431B3 WSA Westdeutsche Kanäle Standort Rheine</ms:VERANTWORTLICHER>
  </ms:strassen_und_wegebrueckenanlagen></wfs:member>`

const XML = `<wfs:FeatureCollection xmlns:wfs="x" xmlns:ms="y" xmlns:gml="z">
  ${member("7535101c-5c41-4268-88e5-21c76e4a227b", 51.669349, 7.371872, "Kanalbrückenanlage Klauke Nr.901", "www.wsv.de")}
  ${member("aaaa1111-0000-4000-8000-000000000002", 52.1, 8.2, "Brücke mit Beschränkung", "lichte Höhe 3,80 m, max 30 t")}
</wfs:FeatureCollection>`

afterEach(() => vi.restoreAllMocks())

describe("GST-WSV Connector 0303", () => {
  it("parst GML-Member → Brücken mit Koords + defensiver Maß-Extraktion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, text: async () => XML })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(2)

    const a = obstacles[0]
    expect(a.kategorie).toBe("bruecke")
    expect(a.externeId).toBe("7535101c-5c41-4268-88e5-21c76e4a227b")
    expect(a.name).toBe("Kanalbrückenanlage Klauke Nr.901")
    expect(a.lat).toBeCloseTo(51.669349, 5)
    expect(a.lng).toBeCloseTo(7.371872, 5)
    expect(a.attrs).toEqual({}) // FURTHERINFO=www.wsv.de → keine Maße

    const b = obstacles[1]
    expect(b.attrs.maxHoeheM).toBe(3.8) // aus „lichte Höhe 3,80 m"
    expect(b.attrs.maxGewichtT).toBe(30) // aus „max 30 t"
  })

  it("verwirft Member ohne Koordinaten", async () => {
    const noGeo = `<wfs:FeatureCollection xmlns:ms="y"><wfs:member><ms:strassen_und_wegebrueckenanlagen gml:id="x.1"><ms:UUID>x</ms:UUID><ms:BENENNUNG>ohne Geo</ms:BENENNUNG></ms:strassen_und_wegebrueckenanlagen></wfs:member></wfs:FeatureCollection>`
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, text: async () => noGeo })
    const { obstacles } = await conn.fetch({ timeoutMs: 1000 })
    expect(obstacles).toHaveLength(0)
  })
})
