// unzipEntry: dependency-freier ZIP-Single-Entry-Extraktor (stored + deflate). Round-Trip-Test.
import { describe, it, expect } from "vitest"
import zlib from "node:zlib"
import { unzipEntry } from "../src/connectors/_helpers.js"

// Baut einen minimalen ZIP-Local-File-Header + Daten für eine Datei.
function zipEntry(name, content, method) {
  const nameB = Buffer.from(name, "utf8")
  const data = method === 8 ? zlib.deflateRawSync(content) : Buffer.from(content)
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50, 0) // PK\x03\x04
  h.writeUInt16LE(method, 8)
  h.writeUInt32LE(0, 14) // crc (ungeprüft)
  h.writeUInt32LE(data.length, 18) // compSize
  h.writeUInt32LE(Buffer.from(content).length, 22) // uncompSize
  h.writeUInt16LE(nameB.length, 26)
  h.writeUInt16LE(0, 28) // extraLen
  return Buffer.concat([h, nameB, data])
}

describe("unzipEntry", () => {
  it("extrahiert deflate-komprimierten Eintrag per Namens-Regex", () => {
    const zip = Buffer.concat([
      zipEntry("Umleitungen.geojson", '{"x":0}', 8),
      zipEntry("Baustelleninfo_Sperrungen_Sachsen.geojson", '{"features":[1,2,3]}', 8),
    ])
    const out = unzipEntry(zip, /Sperrungen.*\.geojson$/i)
    expect(out.toString("utf8")).toBe('{"features":[1,2,3]}')
  })

  it("unterstützt stored (method 0) + liefert null wenn kein Treffer", () => {
    const zip = zipEntry("a.txt", "hallo", 0)
    expect(unzipEntry(zip, /a\.txt$/).toString("utf8")).toBe("hallo")
    expect(unzipEntry(zip, /nope/)).toBeNull()
    expect(unzipEntry(null, /x/)).toBeNull()
  })
})
