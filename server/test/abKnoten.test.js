import { describe, it, expect } from "vitest"
import { resolveKnoten } from "../src/external/abKnoten.js"

// Matching-Logik aus dem Prototyp auf der statischen Gazetteer: Kürzel ausgeschrieben, typ-bewusst,
// adjektivisch (Bremen→Bremer Kreuz), Tippfehler (Wünneberg→Wünnenberg), Glue (Stuhr A28), Stadt-Abk.
describe("abKnoten.resolveKnoten", () => {
  it("Anschlussstelle exakt", () => {
    expect(resolveKnoten("Anschlussstelle Offenburg")?.name).toMatch(/Offenburg/i)
  })
  it("adjektivischer Kreuz-Name: Bremen → Bremer Kreuz (Typ schlägt falschen Exakt-Treffer)", () => {
    const k = resolveKnoten("Autobahnkreuz Bremen")
    expect(k?.name).toMatch(/Bremer Kreuz/i)
  })
  it("geklebte Straßennr.: Stuhr A28 → Dreieck Stuhr", () => {
    expect(resolveKnoten("Autobahndreieck Stuhr A28")?.name).toMatch(/Stuhr/i)
  })
  it("Bescheid-Tippfehler: Wünneberg → Wünnenberg (NICHT 'Haar')", () => {
    const k = resolveKnoten("Autobahnkreuz Wünneberg Haaren")
    expect(k?.name).toMatch(/Wünnenberg/i)
    expect(k?.name).not.toMatch(/^Haar$/i)
  })
  it("Stadt-Abkürzung: PB Elsen → Paderborn-Elsen", () => {
    expect(resolveKnoten("Anschlussstelle PB Elsen")?.name).toMatch(/Paderborn/i)
  })
  it("Unsinn → null", () => {
    expect(resolveKnoten("Anschlussstelle Xyzqwk")).toBeNull()
  })
})
