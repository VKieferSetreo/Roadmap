// Tests zum Punkt-Parser (T-739). Alle Fixtures entstehen hier im Test — für KMZ wird ein echtes
// ZIP byteweise gebaut, für GPKG die reine WKB-Dekodierung isoliert geprüft. Eine vollständige
// .gpkg-Datei zu erzeugen hieße SQLite-Seiten von Hand zu schreiben; der Rest von
// parseGpkgPunkte ist SQL-Verdrahtung, die nur gegen eine echte Datei etwas beweist.

import { describe, it, expect } from "vitest"
import { deflateRawSync } from "node:zlib"
import {
  MAX_PUNKTE_JE_EBENE,
  MAX_ATTRIBUTE_JE_PUNKT,
  baueMarkierung,
  istReinePunktDatei,
  parsePunkteFile,
  parsePunkteGeoJson,
  parsePunkteKml,
} from "./parsePunkte"
import { unzip } from "./unzip"
import { _decodeGpkgGeometry } from "./parseGpkg"

/** jsdom-Blobs können weder text() noch arrayBuffer() — daher eine minimale File-Attrappe. */
function alsDatei(name: string, inhalt: string | Uint8Array): File {
  const bytes = typeof inhalt === "string" ? new TextEncoder().encode(inhalt) : inhalt
  return {
    name,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File
}

// ------------------------------------------------------------------ KML

const KML_MIT_PRAEFIX = `<?xml version="1.0" encoding="UTF-8"?>
<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2">
  <kml:Document>
    <kml:name>Rastplätze</kml:name>
    <kml:Placemark>
      <kml:name>Rastplatz Süd</kml:name>
      <kml:Point><kml:coordinates>9.1829,48.7758,0</kml:coordinates></kml:Point>
    </kml:Placemark>
  </kml:Document>
</kml:kml>`

describe("parsePunkteKml", () => {
  it("liest Punkte auch mit Namespace-Präfix (getElementsByTagName fände hier nichts)", () => {
    const ebenen = parsePunkteKml(KML_MIT_PRAEFIX)
    expect(ebenen).toHaveLength(1)
    expect(ebenen[0].name).toBe("Rastplätze")
    expect(ebenen[0].punkte).toEqual([{ lat: 48.7758, lng: 9.1829, name: "Rastplatz Süd" }])
  })

  it("zieht Attribute aus beiden ExtendedData-Formen und aus <description>", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Windräder</name>
      <Placemark>
        <name>WEA 12</name>
        <description>Nabenhöhe 140 m</description>
        <ExtendedData>
          <Data name="Betreiber"><value>Stadtwerke</value></Data>
          <SchemaData schemaUrl="#s"><SimpleData name="Leistung">3,4 MW</SimpleData></SchemaData>
        </ExtendedData>
        <Point><coordinates>8.5,52.1</coordinates></Point>
      </Placemark></Document></kml>`
    const [ebene] = parsePunkteKml(kml)
    expect(ebene.punkte[0].attribute).toEqual({
      Beschreibung: "Nabenhöhe 140 m",
      Betreiber: "Stadtwerke",
      Leistung: "3,4 MW",
    })
  })

  it("macht aus jedem <Folder> eine eigene Ebene", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Alles</name>
      <Folder><name>Parkplätze</name>
        <Placemark><name>P1</name><Point><coordinates>7.1,51.1</coordinates></Point></Placemark>
        <Placemark><name>P2</name><Point><coordinates>7.2,51.2</coordinates></Point></Placemark>
      </Folder>
      <Folder><name>Kräne</name>
        <Placemark><name>K1</name><Point><coordinates>7.3,51.3</coordinates></Point></Placemark>
      </Folder></Document></kml>`
    const ebenen = parsePunkteKml(kml)
    expect(ebenen.map((e) => [e.name, e.punkte.length])).toEqual([
      ["Parkplätze", 2],
      ["Kräne", 1],
    ])
  })

  it("wirft eine verständliche Meldung, wenn kein Punkt enthalten ist", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
      <LineString><coordinates>7,51 7.1,51.1</coordinates></LineString></Placemark></Document></kml>`
    expect(() => parsePunkteKml(kml)).toThrow(/enthält keine Punkte/)
  })

  it("wirft NaN- und Bereichs-Ausreißer raus, statt sie durchzureichen", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Gemischt</name>
      <Placemark><name>gut</name><Point><coordinates>9.0,48.0</coordinates></Point></Placemark>
      <Placemark><name>leer</name><Point><coordinates></coordinates></Point></Placemark>
      <Placemark><name>text</name><Point><coordinates>abc,def</coordinates></Point></Placemark>
      <Placemark><name>utm</name><Point><coordinates>512345.6,5678901.2</coordinates></Point></Placemark>
      <Placemark><name>halb</name><Point><coordinates>9.18,</coordinates></Point></Placemark>
      </Document></kml>`
    const [ebene] = parsePunkteKml(kml)
    expect(ebene.punkte.map((p) => p.name)).toEqual(["gut"])
  })

  it("lehnt mehr als 5.000 Punkte je Ebene ab, statt auszudünnen", () => {
    const pm = (i: number) =>
      `<Placemark><Point><coordinates>${(7 + i / 1e6).toFixed(6)},51.0</coordinates></Point></Placemark>`
    const zuViele = Array.from({ length: MAX_PUNKTE_JE_EBENE + 1 }, (_, i) => pm(i)).join("")
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Masse</name>${zuViele}</Document></kml>`
    expect(() => parsePunkteKml(kml)).toThrow(/5001 Punkte/)
    expect(() => parsePunkteKml(kml)).toThrow(/höchstens 5000 Punkte je Ebene/)

    const gerade = Array.from({ length: MAX_PUNKTE_JE_EBENE }, (_, i) => pm(i)).join("")
    const okKml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Masse</name>${gerade}</Document></kml>`
    expect(parsePunkteKml(okKml)[0].punkte).toHaveLength(MAX_PUNKTE_JE_EBENE)
  })
})

describe("istReinePunktDatei", () => {
  it("erkennt eine reine Punkt-KML — die darf nicht still zur Strecke werden", () => {
    const zweiPunkte = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>7.0,51.0</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>7.1,51.1</coordinates></Point></Placemark></Document></kml>`
    expect(istReinePunktDatei(zweiPunkte)).toBe(true)
    // Der bestehende Strecken-Parser würde genau daraus eine Linie mit zwei Stützpunkten machen.
    expect(parsePunkteKml(zweiPunkte)[0].punkte).toHaveLength(2)
  })

  it("hält eine echte Strecke und gemischte Dateien für keine Punkt-Datei", () => {
    const linie = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
      <LineString><coordinates>7,51 7.1,51.1</coordinates></LineString></Placemark></Document></kml>`
    const gemischt = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>7,51</coordinates></Point></Placemark>
      <Placemark><LineString><coordinates>7,51 7.1,51.1</coordinates></LineString></Placemark></Document></kml>`
    expect(istReinePunktDatei(linie)).toBe(false)
    expect(istReinePunktDatei(gemischt)).toBe(false)
    expect(istReinePunktDatei("kein XML")).toBe(false)
  })

  it("erkennt Punkte auch bei Namespace-Präfix", () => {
    expect(istReinePunktDatei(KML_MIT_PRAEFIX)).toBe(true)
  })
})

// ------------------------------------------------------------------ GeoJSON

describe("parsePunkteGeoJson", () => {
  it("liest MultiPoint zu je einem Punkt auf, mit denselben Attributen", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NAME: "Windpark Nord", betreiber: "EnBW" },
          geometry: { type: "MultiPoint", coordinates: [[8.1, 53.2], [8.15, 53.25]] },
        },
      ],
    })
    const [ebene] = parsePunkteGeoJson(geojson, "wind")
    expect(ebene.name).toBe("wind")
    expect(ebene.punkte).toEqual([
      // NAME steht NICHT mehr in den Attributen: die Spalte hat die Überschrift geliefert, und im
      // Popup stünde sie sonst zweimal (fett oben und als Zeile darunter). `betreiber` bleibt.
      { lat: 53.2, lng: 8.1, name: "Windpark Nord", attribute: { betreiber: "EnBW" } },
      { lat: 53.25, lng: 8.15, name: "Windpark Nord", attribute: { betreiber: "EnBW" } },
    ])
  })

  it("überspringt Linien und unbrauchbare Koordinaten", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[7, 51], [8, 52]] } },
        { type: "Feature", properties: { name: "ok" }, geometry: { type: "Point", coordinates: [7.5, 51.5] } },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [null, 51.5] } },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [7.5] } },
      ],
    })
    const [ebene] = parsePunkteGeoJson(geojson)
    // `name` war die einzige Eigenschaft und ist als Überschrift verbraucht → gar keine Attribute.
    expect(ebene.punkte).toEqual([{ lat: 51.5, lng: 7.5, name: "ok" }])
  })

  it("meldet unlesbares JSON in der Sie-Form", () => {
    expect(() => parsePunkteGeoJson("{kaputt")).toThrow(/Bitte prüfen Sie die Datei/)
  })
})

// ------------------------------------------------------------------ Grenzen

describe("baueMarkierung", () => {
  it("kappt bei 30 Attributen und begrenzt Schlüssel- und Wertlänge", () => {
    const roh: Record<string, unknown> = {}
    for (let i = 0; i < 45; i++) roh[`schluessel_${String(i).padStart(2, "0")}`] = `wert ${i}`
    roh["x".repeat(80)] = "y".repeat(300)
    const punkt = baueMarkierung(51, 7, "n".repeat(250), roh)!
    const attribute = punkt.attribute!
    expect(Object.keys(attribute)).toHaveLength(MAX_ATTRIBUTE_JE_PUNKT)
    // Es bleiben die ERSTEN 30, nicht irgendwelche 30.
    expect(Object.keys(attribute)[0]).toBe("schluessel_00")
    expect(Object.keys(attribute)[29]).toBe("schluessel_29")
    expect(punkt.name).toHaveLength(200)
  })

  it("kappt Schlüssel auf 60 und Werte auf 200 Zeichen", () => {
    const punkt = baueMarkierung(51, 7, "", { ["x".repeat(80)]: "y".repeat(300) })!
    const [schluessel, wert] = Object.entries(punkt.attribute!)[0]
    expect(schluessel).toHaveLength(60)
    expect(wert).toHaveLength(200)
  })

  it("lässt leere Werte und unbrauchbare Koordinaten nicht durch", () => {
    expect(baueMarkierung(51, 7, "", { a: null, b: "  ", c: undefined })?.attribute).toBeUndefined()
    expect(baueMarkierung(Number.NaN, 7, "", {})).toBeNull()
    expect(baueMarkierung(51, Number.POSITIVE_INFINITY, "", {})).toBeNull()
    expect(baueMarkierung(91, 7, "", {})).toBeNull()
    expect(baueMarkierung(51, 181, "", {})).toBeNull()
  })
})

// ------------------------------------------------------------------ ZIP / KMZ

/** Baut ein echtes ZIP (Central Directory inklusive) aus einem einzigen Eintrag. */
function baueZip(
  eintraege: { name: string; daten: Uint8Array; methode: 0 | 8; entpacktLuege?: number }[],
): Uint8Array {
  const teile: Uint8Array[] = []
  const zentral: Uint8Array[] = []
  let offset = 0
  for (const e of eintraege) {
    const name = new TextEncoder().encode(e.name)
    const daten = e.methode === 8 ? new Uint8Array(deflateRawSync(e.daten)) : e.daten
    const lokal = new Uint8Array(30 + name.length)
    const ldv = new DataView(lokal.buffer)
    ldv.setUint32(0, 0x04034b50, true)
    ldv.setUint16(8, e.methode, true)
    ldv.setUint32(18, daten.length, true)
    ldv.setUint32(22, e.daten.length, true)
    ldv.setUint16(26, name.length, true)
    lokal.set(name, 30)
    teile.push(lokal, daten)

    const cd = new Uint8Array(46 + name.length)
    const cdv = new DataView(cd.buffer)
    cdv.setUint32(0, 0x02014b50, true)
    cdv.setUint16(10, e.methode, true)
    cdv.setUint32(20, daten.length, true)
    cdv.setUint32(24, e.entpacktLuege ?? e.daten.length, true)
    cdv.setUint16(28, name.length, true)
    cdv.setUint32(42, offset, true)
    cd.set(name, 46)
    zentral.push(cd)
    offset += lokal.length + daten.length
  }
  const cdGroesse = zentral.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const edv = new DataView(eocd.buffer)
  edv.setUint32(0, 0x06054b50, true)
  edv.setUint16(8, eintraege.length, true)
  edv.setUint16(10, eintraege.length, true)
  edv.setUint32(12, cdGroesse, true)
  edv.setUint32(16, offset, true)

  const alles = [...teile, ...zentral, eocd]
  const out = new Uint8Array(alles.reduce((s, t) => s + t.length, 0))
  let o = 0
  for (const t of alles) {
    out.set(t, o)
    o += t.length
  }
  return out
}

describe("unzip", () => {
  it("liest stored und deflate und überspringt Ordnereinträge", async () => {
    const text = "Rastplatz Süd, ".repeat(500)
    const zip = baueZip([
      { name: "ordner/", daten: new Uint8Array(0), methode: 0 },
      { name: "ordner/klein.txt", daten: new TextEncoder().encode("stored"), methode: 0 },
      { name: "ordner/gross.txt", daten: new TextEncoder().encode(text), methode: 8 },
    ])
    const eintraege = await unzip(zip)
    expect(eintraege.map((e) => e.name)).toEqual(["ordner/klein.txt", "ordner/gross.txt"])
    expect(new TextDecoder().decode(eintraege[1].daten)).toBe(text)
  })

  it("weist an, was kein ZIP ist", async () => {
    await expect(unzip(new TextEncoder().encode("kein zip"))).rejects.toThrow(/kein lesbares ZIP/)
  })

  it("überspringt Einträge, die sich laut Verzeichnis über den Deckel hinaus entpacken", async () => {
    const zip = baueZip([{ name: "doc.kml", daten: new Uint8Array(200_000), methode: 8 }])
    await expect(unzip(zip, 1024)).resolves.toEqual([])
  })

  it("bricht ab, wenn ein Eintrag über seine angegebene Größe hinaus entpackt (Zip-Bombe)", async () => {
    // 200 KB Nullen komprimieren auf ein paar hundert Byte; das Verzeichnis behauptet 500 Byte.
    // Nur ein Deckel BEIM LESEN des Streams fängt das ab, ein Blick ins Verzeichnis nicht.
    const zip = baueZip([
      { name: "doc.kml", daten: new Uint8Array(200_000), methode: 8, entpacktLuege: 500 },
    ])
    await expect(unzip(zip, 1024)).rejects.toThrow(/unverhältnismäßig groß/)
  })
})

describe("parsePunkteFile", () => {
  it("liest ein KMZ (ZIP mit doc.kml) und bevorzugt doc.kml vor anderen KML", async () => {
    const kmz = baueZip([
      { name: "andere.kml", daten: new TextEncoder().encode("<kml/>"), methode: 0 },
      { name: "doc.kml", daten: new TextEncoder().encode(KML_MIT_PRAEFIX), methode: 8 },
    ])
    const ebenen = await parsePunkteFile(alsDatei("standorte.kmz", kmz))
    expect(ebenen[0].punkte[0].name).toBe("Rastplatz Süd")
  })

  it("nimmt den Dateinamen als Ebenennamen, wenn die Datei keinen mitbringt", async () => {
    const geojson = JSON.stringify({ type: "Point", coordinates: [7, 51] })
    const ebenen = await parsePunkteFile(alsDatei("Eigene Standorte.geojson", geojson))
    expect(ebenen).toEqual([{ name: "Eigene Standorte", punkte: [{ lat: 51, lng: 7 }] }])
  })

  it("nennt die unterstützten Formate, wenn die Endung unbekannt ist", async () => {
    await expect(parsePunkteFile(alsDatei("standorte.xlsx", "egal"))).rejects.toThrow(
      /Bitte KML, KMZ, GeoJSON, Shapefile \(\.zip\) oder GeoPackage \(\.gpkg\)/,
    )
  })
})

// ------------------------------------------------------------------ Shapefile

/** Minimales Punkt-Shapefile (Shape-Typ 1): 100-Byte-Kopf, dann je Punkt ein 28-Byte-Satz. */
function baueShp(punkte: [number, number][]): Uint8Array {
  const laenge = 100 + punkte.length * 28
  const b = new Uint8Array(laenge)
  const dv = new DataView(b.buffer)
  dv.setInt32(0, 9994) // File Code, big endian
  dv.setInt32(24, laenge / 2) // Länge in 16-Bit-Wörtern
  dv.setInt32(28, 1000, true)
  dv.setInt32(32, 1, true) // Shape-Typ Point
  const xs = punkte.map((p) => p[0])
  const ys = punkte.map((p) => p[1])
  dv.setFloat64(36, Math.min(...xs), true)
  dv.setFloat64(44, Math.min(...ys), true)
  dv.setFloat64(52, Math.max(...xs), true)
  dv.setFloat64(60, Math.max(...ys), true)
  let o = 100
  punkte.forEach(([x, y], i) => {
    dv.setInt32(o, i + 1) // Satznummer, big endian
    dv.setInt32(o + 4, 10) // Inhaltslänge in Wörtern
    dv.setInt32(o + 8, 1, true)
    dv.setFloat64(o + 12, x, true)
    dv.setFloat64(o + 20, y, true)
    o += 28
  })
  return b
}

/** dBase-III-Tabelle mit reinen Zeichenfeldern, wahlweise in UTF-8 oder Latin-1 geschrieben. */
function baueDbf(
  felder: { name: string; laenge: number }[],
  werte: string[][],
  kodierung: "utf8" | "latin1",
): Uint8Array {
  const kopf = 32 + 32 * felder.length + 1
  const satz = 1 + felder.reduce((s, f) => s + f.laenge, 0)
  const b = new Uint8Array(kopf + werte.length * satz + 1)
  const dv = new DataView(b.buffer)
  b[0] = 0x03
  dv.setUint32(4, werte.length, true)
  dv.setUint16(8, kopf, true)
  dv.setUint16(10, satz, true)
  felder.forEach((f, i) => {
    const off = 32 + i * 32
    for (let c = 0; c < f.name.length && c < 10; c++) b[off + c] = f.name.charCodeAt(c)
    b[off + 11] = "C".charCodeAt(0)
    b[off + 16] = f.laenge
  })
  b[32 + 32 * felder.length] = 0x0d
  let o = kopf
  for (const zeile of werte) {
    b[o++] = 0x20
    felder.forEach((f, i) => {
      const roh = zeile[i] ?? ""
      const bytes =
        kodierung === "utf8"
          ? new TextEncoder().encode(roh)
          : Uint8Array.from([...roh].map((ch) => ch.charCodeAt(0) & 0xff))
      for (let c = 0; c < f.laenge; c++) b[o + c] = c < bytes.length ? bytes[c] : 0x20
      o += f.laenge
    })
  }
  b[b.length - 1] = 0x1a
  return b
}

function shpEintraege(basis: string, punkte: [number, number][], werte: string[][], kodierung: "utf8" | "latin1") {
  return [
    { name: `${basis}.shp`, daten: baueShp(punkte), methode: 8 as const },
    { name: `${basis}.dbf`, daten: baueDbf([{ name: "NAME", laenge: 20 }], werte, kodierung), methode: 8 as const },
  ]
}

describe("Shapefile-ZIP", () => {
  it("liest Punkte samt Attributen; der .shp-Basisname wird zum Ebenennamen", async () => {
    const zip = baueZip([
      ...shpEintraege("rastplaetze", [[9.1829, 48.7758], [8.4, 49.0]], [["Rastplatz Ost"], ["Rastplatz West"]], "utf8"),
      { name: "rastplaetze.cpg", daten: new TextEncoder().encode("UTF-8"), methode: 0 as const },
    ])
    const ebenen = await parsePunkteFile(alsDatei("rast.zip", zip))
    expect(ebenen).toHaveLength(1)
    expect(ebenen[0].name).toBe("rastplaetze")
    expect(ebenen[0].hinweis).toBeUndefined()
    expect(ebenen[0].punkte).toEqual([
      // Das DBF führt nur NAME, und daraus wurde die Überschrift → keine Attributzeile übrig.
      { lat: 48.7758, lng: 9.1829, name: "Rastplatz Ost" },
      { lat: 49, lng: 8.4, name: "Rastplatz West" },
    ])
  })

  it("weist ohne .cpg auf die kaputten Umlaute hin, statt abzubrechen", async () => {
    // Ohne .cpg dekodiert parsedbf Latin-1-Bytes als UTF-8 → U+FFFD statt „ü".
    const zip = baueZip(shpEintraege("rastplaetze", [[9.1829, 48.7758]], [["Rastplatz Süd"]], "latin1"))
    const [ebene] = await parsePunkteFile(alsDatei("rast.zip", zip))
    expect(ebene.punkte[0].name).toContain("\uFFFD")
    expect(ebene.hinweis).toMatch(/\.cpg-Datei/)
  })

  it("macht aus mehreren .shp im selben ZIP mehrere Ebenen", async () => {
    const zip = baueZip([
      ...shpEintraege("parkplaetze", [[7.1, 51.1]], [["P1"]], "utf8"),
      ...shpEintraege("kraene", [[7.2, 51.2]], [["K1"]], "utf8"),
    ])
    const ebenen = await parsePunkteFile(alsDatei("beides.zip", zip))
    expect(ebenen.map((e) => e.name).sort()).toEqual(["kraene", "parkplaetze"])
  })
})

// ------------------------------------------------------------------ GPKG-WKB

/** GPKG-Blob bauen: Magic "GP", Version, Flags, srs_id, danach die WKB. */
function gpkgBlob(wkb: number[], flags = 0x01): Uint8Array {
  return new Uint8Array([0x47, 0x50, 0x00, flags, 0, 0, 0x10, 0xe6, ...wkb])
}

/** Little-Endian WKB-Punkt (Typ 1) für x/y. */
function wkbPoint(x: number, y: number, typ = 1): number[] {
  const b = new Uint8Array(21)
  const dv = new DataView(b.buffer)
  dv.setUint8(0, 1)
  dv.setUint32(1, typ, true)
  dv.setFloat64(5, x, true)
  dv.setFloat64(13, y, true)
  return Array.from(b)
}

describe("_decodeGpkgGeometry", () => {
  it("liest WKB-Punkte (base 1) nur im Punkt-Modus", () => {
    const blob = gpkgBlob(wkbPoint(9.18, 48.77))
    expect(_decodeGpkgGeometry(blob, "punkt")).toEqual([[9.18, 48.77]])
    // Der Streckenpfad darf davon nichts sehen, sonst wird eine Punkttabelle zur Strecke.
    expect(_decodeGpkgGeometry(blob)).toEqual([])
  })

  it("liest MultiPoint (base 4) als Folge vollständiger WKB-Punkte", () => {
    const kopf = new Uint8Array(9)
    const dv = new DataView(kopf.buffer)
    dv.setUint8(0, 1)
    dv.setUint32(1, 4, true)
    dv.setUint32(5, 2, true)
    const blob = gpkgBlob([...Array.from(kopf), ...wkbPoint(7.1, 51.1), ...wkbPoint(7.2, 51.2)])
    expect(_decodeGpkgGeometry(blob, "punkt")).toEqual([
      [7.1, 51.1],
      [7.2, 51.2],
    ])
  })

  it("versteht PointZ (Typ 1001) und überliest die dritte Dimension", () => {
    const b = new Uint8Array(29)
    const dv = new DataView(b.buffer)
    dv.setUint8(0, 1)
    dv.setUint32(1, 1001, true)
    dv.setFloat64(5, 9.0, true)
    dv.setFloat64(13, 48.0, true)
    dv.setFloat64(21, 320.5, true)
    expect(_decodeGpkgGeometry(gpkgBlob(Array.from(b)), "punkt")).toEqual([[9.0, 48.0]])
  })

  it("überspringt leere Geometrien (Empty-Flag) und Fremd-Blobs", () => {
    expect(_decodeGpkgGeometry(gpkgBlob(wkbPoint(9, 48), 0x11), "punkt")).toEqual([])
    expect(_decodeGpkgGeometry(new Uint8Array([1, 2, 3]), "punkt")).toEqual([])
  })

  it("lässt das Linien-Verhalten unverändert", () => {
    const b = new Uint8Array(9 + 32)
    const dv = new DataView(b.buffer)
    dv.setUint8(0, 1)
    dv.setUint32(1, 2, true)
    dv.setUint32(5, 2, true)
    dv.setFloat64(9, 7.0, true)
    dv.setFloat64(17, 51.0, true)
    dv.setFloat64(25, 7.5, true)
    dv.setFloat64(33, 51.5, true)
    const blob = gpkgBlob(Array.from(b))
    expect(_decodeGpkgGeometry(blob)).toEqual([
      [7.0, 51.0],
      [7.5, 51.5],
    ])
    expect(_decodeGpkgGeometry(blob, "punkt")).toEqual([])
  })
})

describe("Überschrift und Attribute", () => {
  it("entfernt die Namensspalte aus den Attributen, aber nur die (T-739)", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          // „Richtung" trägt DENSELBEN Wert wie der Name, ist aber eine eigene Aussage und muss
          // bleiben. Nur „name" hat die Überschrift geliefert und fällt weg.
          properties: { name: "Nord", Richtung: "Nord", Traglast: "60 t" },
          geometry: { type: "Point", coordinates: [9.9, 51.7] },
        },
      ],
    })
    const [ebene] = parsePunkteGeoJson(geojson)
    expect(ebene.punkte).toEqual([
      { lat: 51.7, lng: 9.9, name: "Nord", attribute: { Richtung: "Nord", Traglast: "60 t" } },
    ])
  })

  it("lässt eine Namensspalte stehen, wenn sie NICHT die Überschrift geliefert hat", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Echter Name", bezeichnung: "Etwas anderes" },
          geometry: { type: "Point", coordinates: [9.9, 51.7] },
        },
      ],
    })
    const [ebene] = parsePunkteGeoJson(geojson)
    expect(ebene.punkte[0].name).toBe("Echter Name")
    expect(ebene.punkte[0].attribute).toEqual({ bezeichnung: "Etwas anderes" })
  })
})
