// ATKIS-Fahrbahnbreiten Thueringen (0235) und Mecklenburg-Vorpommern (0236), T-729.
//
// Drei Dinge tragen die Quelle, und jedes hat hier seinen Test:
// 1. Die Breite ist GESCHAETZT. Mit dem nackten Wert gerechnet waere jeder 4-m-Transport auf jeder
//    4-m-Kreisstrasse kritisch und ein 3,5-m-Transport dort ohne Fund. Das Toleranzband dreht beides.
// 2. Die Achsen sind im Median 90-175 m kurz. Ohne Verkettung wird eine Kreisstrasse zu 30 Funden,
//    mit falscher Verkettung zu einem Linienzug mit Spruengen, den der Kreuzungsfilter verwirft.
// 3. Kreisstrassen in MV heissen "MSE5". Die Engine liest das als Strassennamen und verwirft den Fund,
//    sobald die Route dort einen anderen Namen kennt — deshalb geht es nicht als strassenRef hinaus.

import { afterEach, describe, expect, it, vi } from "vitest"
import { hindernisAusZug, holeFeatures, verkette } from "../src/connectors/_atkisBreiten.js"
import { achseTh, atkisFahrbahnbreitenThConnector as th } from "../src/connectors/0235_atkis_fahrbahnbreiten_th.js"
import { achseMv, strasseMv } from "../src/connectors/0236_atkis_fahrbahnbreiten_mv.js"
import { evaluate } from "../src/engine/rules.js"
import { bewerteAuflagen } from "../src/engine/auflagen.js"
import { analyze } from "../src/engine/index.js"

const thMember = ({ id = "DETHTL2500000SOM", breite = "3.5", widmung = "1306", bez = "K128", streifen = "2.0", richtung = "-9998.0", pos = "50.547124 11.653624 50.547453 11.655612" } = {}) =>
  `<wfs:member><dlm:AX_STRASSENACHSE gml:id="ID_${id}">` +
  `<dlm:eindeutigerObjektidentifikator>${id}</dlm:eindeutigerObjektidentifikator>` +
  `<dlm:AnzahlDerFahrstreifen>${streifen}</dlm:AnzahlDerFahrstreifen><dlm:BreiteDerFahrbahn>${breite}</dlm:BreiteDerFahrbahn>` +
  `<dlm:Fahrtrichtung>${richtung}</dlm:Fahrtrichtung><dlm:Widmung>${widmung}</dlm:Widmung><dlm:Bezeichnung>${bez}</dlm:Bezeichnung>` +
  `<dlm:geom><gml:LineString srsName="urn:ogc:def:crs:EPSG::4326"><gml:posList>${pos}</gml:posList></gml:LineString></dlm:geom>` +
  `</dlm:AX_STRASSENACHSE></wfs:member>`

const achse = (id, punkte, over = {}) => ({ id, bezeichnung: "K128", widmung: "1306", breite: 3.5, punkte, ...over })

describe("Thueringen: Achse lesen", () => {
  it("dreht lat/lon, nimmt die Bundesstrasse vor der Europastrasse, behaelt die Breite", () => {
    const { achsen } = achseTh(thMember({ bez: "B7#E40", widmung: "1303" }))
    expect(achsen).toHaveLength(1)
    expect(achsen[0]).toMatchObject({ id: "DETHTL2500000SOM", bezeichnung: "B7", widmung: "1303", breite: 3.5 })
    expect(achsen[0].punkte[0]).toEqual([11.653624, 50.547124])
  })

  it("verwirft Einbahn-Achsen, einstreifige Achsen und Werte ausserhalb des Bands", () => {
    expect(achseTh(thMember({ richtung: "1.0" })).grund).toBe("einbahn")
    expect(achseTh(thMember({ streifen: "1.0" })).grund).toBe("einstreifig")
    expect(achseTh(thMember({ breite: "4.5" })).grund).toBe("breite")
    expect(achseTh(thMember({ breite: "-9998.0" })).grund).toBe("breite")
  })
})

describe("Mecklenburg-Vorpommern: Achse ueber die Strasse zuordnen", () => {
  const strasse = `<wfs:member><AX_Strasse gml:id="DEMVLM2510000ALg"><bezeichnung>MSE5</bezeichnung><widmung>1306</widmung></AX_Strasse></wfs:member>`
  const gemeinde = `<wfs:member><AX_Strasse gml:id="DEMVGEMEINDE"><bezeichnung>Dorfstraße</bezeichnung><widmung>1307</widmung></AX_Strasse></wfs:member>`
  const strassen = new Map([strasseMv(strasse), strasseMv(gemeinde)])
  const mvAchse = (href, streifen = "2") =>
    `<wfs:member><AX_Strassenachse gml:id="DEMVLM25100002gU"><istTeilVon xlink:href="${href}"/>` +
    `<position><gml:LineString srsName="urn:ogc:def:crs:EPSG::25833"><gml:posList>312280.787 5937712.295 312302.459 5937814.331</gml:posList></gml:LineString></position>` +
    `<breiteDerFahrbahn uom="m">3</breiteDerFahrbahn><anzahlDerFahrstreifen>${streifen}</anzahlDerFahrstreifen></AX_Strassenachse></wfs:member>`

  it("holt Bezeichnung und Widmung ueber istTeilVon und rechnet UTM 33 um", () => {
    const { achsen } = achseMv(mvAchse("urn:adv:oid:DEMVLM2510000ALg"), strassen)
    expect(achsen[0]).toMatchObject({ bezeichnung: "MSE5", widmung: "1306", breite: 3 })
    const [lng, lat] = achsen[0].punkte[0]
    expect(lat).toBeGreaterThan(53) // Mecklenburg-Vorpommern, nicht irgendwo
    expect(lat).toBeLessThan(55)
    expect(lng).toBeGreaterThan(10.5)
    expect(lng).toBeLessThan(14.5)
  })

  it("laesst Gemeindestrassen und Rampen draussen", () => {
    expect(achseMv(mvAchse("urn:adv:oid:DEMVGEMEINDE"), strassen).grund).toBe("strasse")
    expect(achseMv(mvAchse("urn:adv:oid:DEMVLM2510000ALg", "1"), strassen).grund).toBe("einstreifig")
  })
})

describe("Verkettung", () => {
  it("fuegt Achsen in Reihenfolge zusammen, auch wenn eine rueckwaerts digitalisiert ist", () => {
    const zuege = verkette([
      achse("b", [[11.002, 50], [11.001, 50]]), // rueckwaerts
      achse("a", [[11.0, 50], [11.001, 50]]),
      achse("c", [[11.002, 50], [11.003, 50]]),
    ])
    expect(zuege).toHaveLength(1)
    // Streng monoton, also ohne Rueckspruenge: genau der Linienzug, den der Kreuzungsfilter braucht.
    const lngs = zuege[0].punkte.map((p) => p[0])
    const aufsteigend = lngs.every((v, i) => i === 0 || v > lngs[i - 1])
    const absteigend = lngs.every((v, i) => i === 0 || v < lngs[i - 1])
    expect(aufsteigend || absteigend).toBe(true)
    expect(lngs).toHaveLength(4)
    expect([...zuege[0].ids].sort()).toEqual(["a", "b", "c"])
  })

  it("bricht an einer Verzweigung ab und verkettet keine verschiedenen Breiten", () => {
    const stern = verkette([
      achse("a", [[11.0, 50], [11.001, 50]]),
      achse("b", [[11.001, 50], [11.002, 50]]),
      achse("c", [[11.001, 50], [11.001, 50.001]]),
    ])
    expect(stern).toHaveLength(3)
    const breiten = verkette([achse("a", [[11.0, 50], [11.001, 50]]), achse("b", [[11.001, 50], [11.002, 50]], { breite: 3 })])
    expect(breiten).toHaveLength(2)
  })
})

describe("Hindernis aus einem Zug", () => {
  const opts = { land: "Test", quelleName: "Q", quelleUrl: "u" }

  it("setzt den Fund auf die halbe Laenge, nicht an den Netzknoten", () => {
    const o = hindernisAusZug({ ids: ["a"], bezeichnung: "K128", widmung: "1306", breite: 3.5, punkte: [[11.0, 50], [11.01, 50], [11.02, 50]] }, opts)
    expect(o.lng).toBeCloseTo(11.01, 5)
    expect(o.geom).toEqual({ type: "LineString", coordinates: [[11.0, 50], [11.01, 50], [11.02, 50]] })
  })

  it("traegt genau das Toleranzband und zieht aus dem Text nichts dazu", () => {
    const o = hindernisAusZug({ ids: ["a", "b"], bezeichnung: "L1152", widmung: "1305", breite: 4, punkte: [[11.0, 50], [11.01, 50]] }, opts)
    expect(o.attrs).toEqual({ maxBreiteM: 4, breiteToleranzUntenM: 0.5, breiteToleranzObenM: 1 })
    expect(o.kiAufbereitet).toBe(false)
    expect(o.strassenRef).toBe("L1152")
  })

  it("MV-Kreisstrasse: Bezeichnung im Titel, aber NICHT als strassenRef", () => {
    const o = hindernisAusZug({ ids: ["a"], bezeichnung: "MSE5", widmung: "1306", breite: 3, punkte: [[13.0, 53.5], [13.01, 53.5]] }, opts)
    expect(o.name).toBe("Schmale Fahrbahn ca. 3,0 m — Kreisstraße MSE5")
    expect(o.strassenRef).toBeNull()
  })
})

describe("Abruf", () => {
  afterEach(() => vi.restoreAllMocks())
  const antwort = (xml, status = 200) => vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: status === 200, status, text: async () => xml })
  const opts = { namespaces: "", typeName: "dlm:AX_STRASSENACHSE", srsName: "x", filter: "", pauseMs: 0 }

  it("nimmt keinen Teilbestand: weniger Features als numberMatched ist ein Fehler", async () => {
    antwort(`<wfs:FeatureCollection numberMatched="3" numberReturned="1">${thMember()}</wfs:FeatureCollection>`)
    await expect(holeFeatures("u", opts)).rejects.toThrow(/Teilbestand/)
  })

  it("ein leerer Abzug laesst den Bestand stehen", async () => {
    antwort(`<wfs:FeatureCollection numberMatched="0" numberReturned="0"></wfs:FeatureCollection>`)
    await expect(th.fetch()).rejects.toThrow(/0 Achsen/)
  })

  it("ein Fehlerdokument mit HTTP 200 ist ein Fehler", async () => {
    antwort(`<ows:ExceptionReport><ows:ExceptionText>Parameter kaputt</ows:ExceptionText></ows:ExceptionReport>`)
    await expect(holeFeatures("u", opts)).rejects.toThrow(/Parameter kaputt/)
  })
})

describe("Bewertung mit Toleranzband", () => {
  const T = (breite) => ({ laenge: 40, breite, hoehe: 4, gesamtgewicht: 40 })
  const atkis = (maxBreiteM) => ({ id: "x", kategorie: "engstelle", name: "", attrs: { maxBreiteM, breiteToleranzUntenM: 0.5, breiteToleranzObenM: 1 } })
  const sev = (o, t) => evaluate(o, T(t), {})?.severity ?? null

  it.each([
    // [ATKIS-Wert, Transportbreite, erwartet, was der nackte Wert ergaebe]
    [4.0, 3.5, "warnung", null], // nackt: Marge 0,50 → ausgeblendet, obwohl real 3,50 m moeglich
    [4.0, 4.0, "warnung", "kritisch"], // nackt: Marge 0 → kritisch, obwohl real bis 5,00 m
    [3.0, 4.0, "kritisch", "kritisch"], // selbst die Obergrenze 4,00 m laesst 0 m
    [4.0, 3.0, null, null], // Untergrenze 3,50 m laesst 0,50 m
  ])("Wert %f, Transport %f → %s (nackt: %s)", (wert, t, erwartet, nackt) => {
    expect(sev(atkis(wert), t)).toBe(erwartet)
    expect(sev({ ...atkis(wert), attrs: { maxBreiteM: wert } }, t)).toBe(nackt)
  })

  it("nennt Schaetzung und Spanne im Detail", () => {
    const r = evaluate(atkis(4.0), T(3.5), {})
    expect(r.detail).toMatchObject({ "Tatsächlich vermutlich": "3,50 m bis 5,00 m", Marge: "0,00 m bis 1,50 m" })
  })

  // Wie ohne Toleranz: Gegenfahrbahn erst, wenn die Breite UNTER der Transportbreite liegt — hier
  // also selbst die Obergrenze. Genau passend (Obergrenze = Transportbreite) bleibt es bei BF3.
  it("Auflagen folgen denselben Grenzen", () => {
    const zuSchmal = bewerteAuflagen({ kategorie: "engstelle", attrs: atkis(2.5).attrs, transport: T(4.0) })
    expect(zuSchmal.auflagen.join(" ")).toMatch(/Gegenfahrbahn/)
    const knapp = bewerteAuflagen({ kategorie: "engstelle", attrs: atkis(4.0).attrs, transport: T(3.5) })
    expect(knapp.fahrbarkeit).toBe("mit-auflagen")
    expect(knapp.auflagen.join(" ")).toMatch(/vor Ort/)
    expect(knapp.auflagen.join(" ")).not.toMatch(/Gegenfahrbahn/)
    // Der trennende Fall: nackt 3,50 m < 4,00 m waere Gegenfahrbahn, real bis 4,50 m moeglich.
    const geschaetzt = bewerteAuflagen({ kategorie: "engstelle", attrs: atkis(3.5).attrs, transport: T(4.0) })
    expect(geschaetzt.auflagen.join(" ")).not.toMatch(/Gegenfahrbahn/)
    expect(geschaetzt.auflagen.join(" ")).toMatch(/vor Ort/)
  })
})

describe("durch die Engine", () => {
  const strasse = [[11.0, 50.0], [11.004, 50.0], [11.008, 50.0], [11.012, 50.0]]
  const lauf = (routePunkte, geom) => {
    const o = hindernisAusZug({ ids: ["a"], bezeichnung: "K128", widmung: "1306", breite: 3.5, punkte: geom }, { land: "Test", quelleName: "Q", quelleUrl: "u" })
    const zeile = { id: "o1", kategorie: o.kategorie, name: o.name, beschreibung: o.beschreibung, lat: o.lat, lng: o.lng, strassen_ref: o.strassenRef, attrs: o.attrs, geom: o.geom, quelle: o.quelle, tenant_id: null }
    const db = { query: async (t) => (t.includes("FROM obstacles") ? { rows: [zeile] } : { rows: [] }) }
    return analyze({
      db,
      project: { id: null, transport: { laenge: 40, breite: 3.5, hoehe: 4, gesamtgewicht: 40 }, zeitraum: {}, routes: [{ id: "r", name: "r", points: routePunkte.map(([lng, lat]) => ({ lat, lng })), source: "upload" }] },
      corridorM: 20,
    })
  }

  it("meldet den Abschnitt, auf dem die Route faehrt — in beiden Richtungen", async () => {
    expect((await lauf(strasse, strasse)).findings.map((f) => f.severity)).toEqual(["warnung"])
    expect((await lauf([...strasse].reverse(), strasse)).findings.map((f) => f.severity)).toEqual(["warnung"])
  })

  it("meldet NICHT die schmale Seitenstrasse, die an der Route nur abgeht", async () => {
    const seitenstrasse = [[11.004, 50.0], [11.004, 50.004]]
    expect((await lauf(strasse, seitenstrasse)).findings).toEqual([])
  })
})
