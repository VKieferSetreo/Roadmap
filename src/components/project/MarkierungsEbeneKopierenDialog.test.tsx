// Ebene in ein anderes Projekt kopieren (T-742). Geprüft wird vor allem, was anders ist als beim
// Strecken-Kopieren (T-658): das Ziel wird nachgeladen, die Grenzen gelten fürs Ziel, und eine für
// den Kunden ausgeblendete Ebene bleibt in der Kopie ausgeblendet.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { MarkierungsEbene, Project } from "@/types/domain"

const { api, toast } = vi.hoisted(() => ({
  api: { getProject: vi.fn(), patchProject: vi.fn() },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/api/roadmap", () => ({ api }))
vi.mock("@/store/datasource", () => ({ isLive: () => true }))
vi.mock("sonner", () => ({ toast }))

import { MarkierungsEbeneKopierenDialog } from "./MarkierungsEbeneKopierenDialog"
import { MarkierungenCard } from "./MarkierungenCard"
import { useProjectStore } from "@/store/projects"
import { projekt as basis } from "@/test/fixtures"
import { MARKIERUNG_GRENZEN } from "@/types/domain"

const punkte = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ lat: 52 + i / 1e4, lng: 10, name: `P${i}`, attribute: { Nr: String(i) } }))
const ebene = (over: Partial<MarkierungsEbene> = {}): MarkierungsEbene => ({
  id: "e-quelle",
  name: "Parkplätze",
  farbe: "#0F766E",
  fileName: "p.kml",
  punkte: punkte(3),
  ...over,
})
const proj = (id: string, name: string, over: Partial<Project> = {}): Project => ({ ...basis(), id, name, markierungen: [], ...over })

function oeffne(quelle: Project, e: MarkierungsEbene, weitere: Project[] = []) {
  useProjectStore.setState({ projects: [quelle, ...weitere], markierungenLadefehler: {} })
  const onSchliessen = vi.fn()
  render(<MarkierungsEbeneKopierenDialog ebene={e} quelle={quelle} onSchliessen={onSchliessen} />)
  return onSchliessen
}
const dialog = () => screen.getByRole("dialog")
const waehle = (name: string) => fireEvent.click(within(dialog()).getByRole("button", { name: new RegExp(name) }))
const kopiere = () => fireEvent.click(within(dialog()).getByRole("button", { name: /Kopieren/ }))
const ebenenVon = (id: string) => useProjectStore.getState().getProject(id)?.markierungen ?? []

beforeEach(() => {
  api.getProject.mockReset()
  api.patchProject.mockReset()
  api.patchProject.mockResolvedValue({ version: 1 })
  Object.values(toast).forEach((f) => f.mockReset())
})

describe("Ebene kopieren", () => {
  it("ins aktuelle Projekt: als „(Kopie)“ mit allen Punkten und Attributen, eigener id und Farbe", async () => {
    const e = ebene()
    const q = proj("q", "Quelle", { markierungen: [e] })
    const schliessen = oeffne(q, e)
    kopiere()
    await waitFor(() => expect(schliessen).toHaveBeenCalled())
    const [original, kopie] = ebenenVon("q")
    expect(kopie.name).toBe("Parkplätze (Kopie)")
    expect(kopie.punkte).toEqual(original.punkte)
    expect(kopie.id).not.toBe(original.id)
    expect(kopie.farbe).not.toBe(original.farbe)
  })

  it("in ein anderes Projekt ohne Markierungen: Name unverändert, Quelle bleibt", async () => {
    const e = ebene()
    const schliessen = oeffne(proj("q", "Quelle", { markierungen: [e] }), e, [proj("z", "Ziel A7")])
    waehle("Ziel A7")
    kopiere()
    await waitFor(() => expect(schliessen).toHaveBeenCalled())
    expect(ebenenVon("z").map((x) => x.name)).toEqual(["Parkplätze"])
    expect(ebenenVon("q")).toHaveLength(1)
  })

  it("lädt ein Ziel in Listen-Fassung erst nach, statt an der Sperre zu scheitern", async () => {
    const e = ebene()
    const zielListe = proj("z", "Ziel mit Ebenen", {
      markierungen: [{ id: "alt", name: "Alt", farbe: "#6D28D9", punkte: [], anzahl: 2 }],
    })
    api.getProject.mockResolvedValue({
      ...zielListe,
      markierungen: [{ id: "alt", name: "Alt", farbe: "#6D28D9", punkte: punkte(2) }],
    })
    const schliessen = oeffne(proj("q", "Quelle", { markierungen: [e] }), e, [zielListe])
    waehle("Ziel mit Ebenen")
    kopiere()
    await waitFor(() => expect(schliessen).toHaveBeenCalled())
    expect(api.getProject).toHaveBeenCalledWith("z")
    // Die alte Ebene ist VOLLSTÄNDIG geblieben (nicht mit leeren Punkten überschrieben), die neue dazu.
    expect(ebenenVon("z").map((x) => [x.name, x.punkte.length])).toEqual([["Alt", 2], ["Parkplätze", 3]])
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("meldet es im Dialog, wenn das Ziel nicht nachgeladen werden kann, und fügt nichts ein", async () => {
    const e = ebene()
    const zielListe = proj("z", "Ziel offline", { markierungen: [{ id: "alt", name: "Alt", farbe: "#6D28D9", punkte: [], anzahl: 2 }] })
    api.getProject.mockRejectedValue(new Error("Netz weg"))
    const schliessen = oeffne(proj("q", "Quelle", { markierungen: [e] }), e, [zielListe])
    waehle("Ziel offline")
    kopiere()
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(/konnten nicht geladen werden/)
    expect(schliessen).not.toHaveBeenCalled()
    expect(ebenenVon("z").map((x) => x.name)).toEqual(["Alt"])
  })

  it("prüft die Grenze gegen das ZIEL und nennt die Abhilfe", async () => {
    const e = ebene({ punkte: punkte(10) })
    const vollesZiel = proj("z", "Volles Ziel", {
      markierungen: [{ id: "voll", name: "Voll", farbe: "#6D28D9", punkte: punkte(MARKIERUNG_GRENZEN.punkteJeProjekt - 5) }],
    })
    const schliessen = oeffne(proj("q", "Quelle", { markierungen: [e] }), e, [vollesZiel])
    waehle("Volles Ziel")
    kopiere()
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(/erlaubt sind.*anderes Projekt/)
    expect(schliessen).not.toHaveBeenCalled()
    expect(ebenenVon("z")).toHaveLength(1)
  })

  it("übernimmt eine Ausblendung: die Kopie einer internen Ebene geht NICHT in den Kundenlink", async () => {
    const e = ebene({ oeffentlich: false })
    const schliessen = oeffne(proj("q", "Quelle", { markierungen: [e] }), e, [proj("z", "Kundenprojekt")])
    expect(within(dialog()).getByText(/ausgeblendet — die Kopie ebenfalls/)).toBeInTheDocument()
    waehle("Kundenprojekt")
    kopiere()
    await waitFor(() => expect(schliessen).toHaveBeenCalled())
    expect(ebenenVon("z")[0].oeffentlich).toBe(false)
  })

  it("der Knopf in der Ebenen-Liste öffnet den Dialog", () => {
    const e = ebene()
    const q = proj("q", "Quelle", { markierungen: [e] })
    useProjectStore.setState({ projects: [q], markierungenLadefehler: {} })
    render(<MarkierungenCard project={q} />)
    fireEvent.click(screen.getByRole("button", { name: /Ebene Parkplätze in ein Projekt kopieren/ }))
    expect(within(screen.getByRole("dialog")).getByText("Ebene kopieren")).toBeInTheDocument()
  })
})
