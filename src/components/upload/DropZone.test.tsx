// Wächter für T-743. Der Datei-Input der DropZone trägt `sr-only`, also `position: absolute`.
// Fehlt dem Wrapper `relative`, bezieht sich der Input auf den initialen Containing Block,
// entkommt dem `overflow` des scrollenden Bereichs und dehnt das DOKUMENT bis zu seiner
// Position — die Seite bekommt eine zweite Scroll-Ebene und schiebt beim Scrollen ans Ende
// Kopfzeile, Seitenleiste und Fußzeile aus dem Bild.
//
// Gemessen wurde das im echten Browser (Dokument 901 px bei 617 px Viewport, mit `relative`
// wieder 617). jsdom rechnet kein Layout, kann den Effekt also nicht nachstellen. Geprüft wird
// deshalb die Zusicherung, die ihn verhindert: Wrapper positioniert, Input `sr-only`. Wer eines
// von beiden entfernt, bekommt den Bug zurück — und hier einen roten Test.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DropZone } from "./DropZone"

describe("DropZone", () => {
  it("positioniert den Wrapper, weil der sr-only-Input sonst das Dokument dehnt (T-743)", () => {
    const { container } = render(<DropZone label="Datei hochladen" onFile={vi.fn()} />)
    const wrapper = container.firstElementChild
    expect(wrapper).not.toBeNull()
    expect(wrapper).toHaveClass("relative")

    // Die andere Hälfte der Zusicherung: der Input ist wirklich der absolut positionierte.
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveClass("sr-only")
    expect(wrapper?.contains(input!)).toBe(true)
  })

  it("gilt auch in der fill-Variante, die eigene Layout-Klassen mitbringt", () => {
    const { container } = render(<DropZone label="Datei" onFile={vi.fn()} fill />)
    expect(container.firstElementChild).toHaveClass("relative")
  })

  it("meldet eine zu große Datei, statt sie stillschweigend zu schlucken", async () => {
    const onFile = vi.fn()
    const { container } = render(<DropZone label="Datei" onFile={onFile} maxSizeMb={1} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const gross = new File([new Uint8Array(2 * 1024 * 1024)], "gross.kml", { type: "text/xml" })
    Object.defineProperty(input, "files", { value: [gross] })
    fireEvent.change(input)
    expect(onFile).not.toHaveBeenCalled()
    expect(await screen.findByRole("alert")).toHaveTextContent(/zu groß/i)
  })
})
