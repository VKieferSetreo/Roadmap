// Markierungs-Block (T-744): Byte-Deckel und Auswahldialog bei Ablehnung.
//
// Der Parser ist ersetzt — getestet wird hier, was der Block mit dem Ergebnis macht, nicht das
// Einlesen der Datei (das deckt parsePunkte.test.ts ab). Store echt, Netz ersetzt.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Markierung, Project } from "@/types/domain"

const { api, toast, parse } = vi.hoisted(() => ({
  api: { getProject: vi.fn(), patchProject: vi.fn() },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
  parse: vi.fn(),
}))
vi.mock("@/api/roadmap", () => ({ api }))
vi.mock("@/store/datasource", () => ({ isLive: () => true }))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/lib/parsePunkte", () => ({ parsePunkteFile: parse }))

import { MarkierungenCard } from "./MarkierungenCard"
import { useProjectStore } from "@/store/projects"
import { projekt as basis } from "@/test/fixtures"
import { MARKIERUNG_GRENZEN } from "@/types/domain"

const P = "p-card"
const punkte = (n: number, attribute?: Record<string, string>): Markierung[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 52 + i / 1e4, lng: 10, ...(attribute ? { attribute } : {}) }))

function laden(over: Partial<Project> = {}) {
  const p: Project = { ...basis(), id: P, markierungen: [], ...over }
  useProjectStore.setState({ projects: [p], markierungenLadefehler: {} })
  return render(<MarkierungenCard project={useProjectStore.getState().getProject(P)!} />)
}
function dateiWaehlen() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, "files", { value: [new File(["x"], "test.kml")], configurable: true })
  fireEvent.change(input)
}

beforeEach(() => {
  parse.mockReset()
  api.patchProject.mockReset()
  api.patchProject.mockResolvedValue({ version: 1 })
  Object.values(toast).forEach((f) => f.mockReset())
})

describe("MarkierungenCard", () => {
  it("lehnt Ebenen ab, die den Byte-Deckel reißen, und speichert nichts", async () => {
    // Wenige Punkte, aber jeder mit 30 langen Umlaut-Werten: unter der Punktgrenze, über den Bytes.
    const dick = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`Spalte${i}`, "ä".repeat(200)]))
    const n = Math.min(MARKIERUNG_GRENZEN.punkteJeEbene, 900)
    parse.mockResolvedValue([{ name: "Dick", punkte: punkte(n, dick) }])
    laden()
    dateiWaehlen()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/MB groß.*erlaubt sind/)))
    expect(useProjectStore.getState().getProject(P)?.markierungen).toEqual([])
  })

  it("lässt den Auswahldialog OFFEN, wenn die gewählten Ebenen die Projektgrenze reißen", async () => {
    const haelfte = Math.floor(MARKIERUNG_GRENZEN.punkteJeProjekt / 2) + 1
    parse.mockResolvedValue([
      { name: "Nord", punkte: punkte(haelfte) },
      { name: "Süd", punkte: punkte(haelfte) },
    ])
    laden()
    dateiWaehlen()
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }))
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/haken Sie weniger Ebenen an/))
    // Vorher schloss sich der Dialog trotzdem, die Auswahl war weg.
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    // Eine Ebene abhaken, dann klappt es — ohne die Datei neu zu wählen.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /Süd/ }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Übernehmen" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(useProjectStore.getState().getProject(P)?.markierungen).toHaveLength(1)
  })
})
