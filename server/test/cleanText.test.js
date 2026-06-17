import { describe, it, expect } from "vitest"
import { cleanText } from "../src/util.js"
import { rowToFinding } from "../src/map.js"

describe("cleanText — Markup-/DATEX-Bracket-Bereinigung", () => {
  it("zieht den deutschen <value lang=\"de\"> heraus", () => {
    const raw = `<comment><values><value lang="de">B72 KP Bagband</value><value lang="en">x</value></values></comment>`
    expect(cleanText(raw)).toBe("B72 KP Bagband")
  })
  it("strippt sonstige Tags und kollabiert Whitespace", () => {
    expect(cleanText("<p>Bau-\n  stelle</p>")).toBe("Bau- stelle")
  })
  it("lässt Plain-Text unverändert und macht aus null einen Leerstring", () => {
    expect(cleanText("A1 Engstelle")).toBe("A1 Engstelle")
    expect(cleanText(null)).toBe("")
  })
  it("rowToFinding bereinigt titel + beschreibung beim Serialisieren", () => {
    const f = rowToFinding({
      id: "x", kategorie: "baustelle", lat: 50, lng: 8, km: 1, severity: "warnung",
      titel: `<comment><values><value lang="de">B72 KP Bagband</value></values></comment>`,
      beschreibung: "<b>Sperrung</b>",
    })
    expect(f.titel).toBe("B72 KP Bagband")
    expect(f.beschreibung).toBe("Sperrung")
  })
})
