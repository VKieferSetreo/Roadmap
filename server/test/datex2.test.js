// DATEX-II-Parser + Mobilithek-Connector — beweist die Integration OHNE Account
// (Sample-XML statt Live-mTLS-Pull).

import { describe, expect, it } from "vitest"
import { parseDatex2 } from "../src/connectors/datex2.js"
import { makeMobilithekConnector, mobilithekFeeds } from "../src/connectors/mobilithek.js"

// Minimaler, realistischer DATEX-II-Ausschnitt (v2-Stil, namespaced) mit zwei Records:
// eine Baustelle (mit Gültigkeit + Koordinaten) und eine Gewichtsbeschränkung.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<d2:d2LogicalModel xmlns:d2="http://datex2.eu/schema/2/2_0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <d2:payloadPublication>
  <d2:situation id="SIT-1">
   <d2:situationRecord id="DE-NI-RW-4711" version="3" xsi:type="MaintenanceWorks">
    <d2:validity>
     <d2:validityTimeSpecification>
      <d2:overallStartTime>2026-05-04T00:00:00+02:00</d2:overallStartTime>
      <d2:overallEndTime>2026-08-31T23:59:00+02:00</d2:overallEndTime>
     </d2:validityTimeSpecification>
    </d2:validity>
    <d2:generalPublicComment>A2 bei Hannover, Fahrbahnerneuerung</d2:generalPublicComment>
    <d2:roadNumber>A2</d2:roadNumber>
    <d2:groupOfLocations>
     <d2:locationForDisplay><d2:latitude>52.4012</d2:latitude><d2:longitude>9.7320</d2:longitude></d2:locationForDisplay>
    </d2:groupOfLocations>
   </d2:situationRecord>
  </d2:situation>
  <d2:situation id="SIT-2">
   <d2:situationRecord id="DE-NI-WL-0815" xsi:type="GeneralNetworkManagement">
    <d2:generalPublicComment>Gewichtsbeschränkung Brücke L390</d2:generalPublicComment>
    <d2:roadNumber>L390</d2:roadNumber>
    <d2:maximumWeight>30</d2:maximumWeight>
    <d2:groupOfLocations>
     <d2:locationForDisplay><d2:latitude>52.55</d2:latitude><d2:longitude>9.10</d2:longitude></d2:locationForDisplay>
    </d2:groupOfLocations>
   </d2:situationRecord>
  </d2:situation>
 </d2:payloadPublication>
</d2:d2LogicalModel>`

describe("parseDatex2", () => {
  it("extrahiert Records mit Kategorie, Gültigkeit, Koordinaten, Straße", () => {
    const obs = parseDatex2(SAMPLE, { quelleName: "Mobilithek NI", quelleUrl: "https://x" })
    expect(obs).toHaveLength(2)

    const rw = obs.find((o) => o.externeId === "DE-NI-RW-4711")
    expect(rw.kategorie).toBe("baustelle")
    expect(rw.lat).toBeCloseTo(52.4012, 3)
    expect(rw.lng).toBeCloseTo(9.732, 3)
    expect(rw.strassenRef).toBe("A2")
    expect(rw.gueltigVon).toBe("2026-05-04")
    expect(rw.gueltigBis).toBe("2026-08-31")
    expect(rw.realerStart).toBe("2026-05-04")
    expect(rw.quelle.name).toBe("Mobilithek NI")

    const wl = obs.find((o) => o.externeId === "DE-NI-WL-0815")
    expect(wl.attrs.maxGewichtT).toBe(30)
    expect(wl.strassenRef).toBe("L390")
  })

  it("GML posList (lat lng …, WGS84) → Punkt + LineString-geom", () => {
    const xml = `<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0"><situation id="S">
      <situationRecord id="BB-1" xsi:type="MaintenanceWorks" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <generalPublicComment>L1 Sperrung</generalPublicComment><roadNumber>L1</roadNumber>
        <groupOfLocations xsi:type="Linear"><linearExtension><linearExtended><gmlLineString>
          <srsName>WGS84 EPSG 4326</srsName>
          <posList>52.5 13.4 52.51 13.41 52.52 13.42</posList>
        </gmlLineString></linearExtended></linearExtension></groupOfLocations>
      </situationRecord></situation></d2LogicalModel>`
    const [o] = parseDatex2(xml, { quelleName: "Mobilithek BB" })
    expect(o.lat).toBeCloseTo(52.5, 3)
    expect(o.lng).toBeCloseTo(13.4, 3)
    expect(o.geom.type).toBe("LineString")
    expect(o.geom.coordinates[0]).toEqual([13.4, 52.5]) // GeoJSON [lng,lat]
    expect(o.geom.coordinates).toHaveLength(3)
  })

  it("ALERT-C/TMC ohne lat/lng → via resolveTmc geocodiert (Primary/Secondary-LCD)", () => {
    const xml = `<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0"><situation id="S">
      <situationRecord id="NI-1" xsi:type="MaintenanceWorks" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <generalPublicComment>B3 Bauarbeiten</generalPublicComment><roadNumber>B3</roadNumber>
        <groupOfLocations xsi:type="Linear"><alertCLinear xsi:type="AlertCMethod4Linear">
          <alertCLocationCountryCode>D</alertCLocationCountryCode><alertCLocationTableNumber>1</alertCLocationTableNumber>
          <alertCMethod4PrimaryPointLocation><alertCLocation><specificLocation>52089</specificLocation></alertCLocation></alertCMethod4PrimaryPointLocation>
          <alertCMethod4SecondaryPointLocation><alertCLocation><specificLocation>25016</specificLocation></alertCLocation></alertCMethod4SecondaryPointLocation>
        </alertCLinear></groupOfLocations>
      </situationRecord></situation></d2LogicalModel>`
    const fakeResolve = ({ primary, secondary }) =>
      primary === 52089 && secondary === 25016
        ? { lat: 53.8, lng: 9.03, geom: { type: "LineString", coordinates: [[9.03, 53.8], [9.17, 53.69]] } }
        : null
    const [withTmc] = parseDatex2(xml, { quelleName: "NI", resolveTmc: fakeResolve })
    expect(withTmc.lat).toBeCloseTo(53.8, 2)
    expect(withTmc.geom.type).toBe("LineString")
    // ohne resolveTmc → keine Koordinaten (Record wird später verworfen)
    const [noResolve] = parseDatex2(xml, { quelleName: "NI" })
    expect(noResolve.lat).toBeNull()
  })

  it("leeres/kaputtes XML → leere Liste (kein Wurf)", () => {
    expect(parseDatex2("")).toEqual([])
    expect(parseDatex2("<html>kein datex</html>")).toEqual([])
  })
})

describe("Mobilithek-Connector (gated bis Account)", () => {
  it("ohne Zertifikat → leere obstacles + kein Wurf", async () => {
    const c = makeMobilithekConnector({ quelleId: "0009", name: "Mobilithek Test", url: "https://x/feed" })
    expect(c.schedule).toBe("0 8,12,18 * * *")
    expect(c.vollbestand).toBe(true)
    const res = await c.fetch({ env: {}, log: () => {} })
    expect(res.obstacles).toEqual([])
  })

  it("mobilithekFeeds liest JSON aus env (leer wenn unkonfiguriert)", () => {
    expect(mobilithekFeeds({})).toEqual([])
    const feeds = mobilithekFeeds({
      MOBILITHEK_FEEDS: '[{"quelleId":"0110","name":"BB","url":"https://m/f1"},{"bad":"ignored"}]',
    })
    expect(feeds).toHaveLength(1)
    expect(feeds[0].quelleId).toBe("0110")
  })
})
