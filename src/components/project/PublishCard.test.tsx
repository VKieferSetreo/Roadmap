// Freigabe je Markierungs-Ebene (T-744). Vorher ging JEDE Ebene samt aller Attribute aus der Datei
// in den geteilten Link, eine Bedienung dafür gab es nicht.
//
// Der Store ist der echte (wie in DashboardTab.test.tsx), nur Netz und Datenquelle sind ersetzt —
// sonst würde ein umbenanntes Feld im Store hier nicht auffallen.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { MarkierungsEbene, Project } from "@/types/domain"

const { api } = vi.hoisted(() => ({ api: { getProject: vi.fn(), patchProject: vi.fn() } }))
vi.mock("@/api/roadmap", () => ({ api }))
vi.mock("@/store/datasource", () => ({ isLive: () => true }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { PublishCard } from "./PublishCard"
import { useProjectStore } from "@/store/projects"
import { projekt as basis, strecke } from "@/test/fixtures"

const P = "p-freigabe"
const ebene = (over: Partial<MarkierungsEbene> = {}): MarkierungsEbene => ({
  id: "e1",
  name: "Parkplätze",
  farbe: "#0F766E",
  punkte: [{ lat: 52, lng: 10 }, { lat: 52.1, lng: 10.1 }],
  ...over,
})
const projekt = (over: Partial<Project> = {}): Project => ({
  ...basis(),
  id: P,
  status: "fertig",
  routes: [strecke({ id: "r1", name: "Hinfahrt" })],
  share: { url: "https://setreo-cloud.com/x/p", hatPasswort: false, createdAt: "2026-09-13T08:00:00Z" },
  ...over,
})

function laden(p: Project) {
  useProjectStore.setState({ projects: [p], markierungenLadefehler: {} })
  return render(<PublishCard project={useProjectStore.getState().getProject(P)!} />)
}
/** Rendert neu mit dem aktuellen Store-Stand (PublishCard bekommt das Projekt als Prop). */
function neuRendern(r: ReturnType<typeof render>) {
  r.rerender(<PublishCard project={useProjectStore.getState().getProject(P)!} />)
}
const dialogOeffnen = () => fireEvent.click(screen.getByRole("button", { name: /Sichtbar \(|Strecken \(/ }))

beforeEach(() => {
  api.getProject.mockReset()
  api.patchProject.mockReset()
  api.patchProject.mockResolvedValue({ version: 1 })
})

describe("Freigabe je Markierungs-Ebene", () => {
  it("ohne Ebenen bleibt der Knopf wie gehabt: Strecken (x/y)", () => {
    laden(projekt({ markierungen: [] }))
    expect(screen.getByRole("button", { name: "Strecken (1/1)" })).toBeInTheDocument()
  })

  it("mit Ebenen meldet der Knopf den Gesamtstand, damit Ausgeblendetes auffällt", () => {
    const r = laden(projekt({ markierungen: [ebene(), ebene({ id: "e2", name: "Intern", oeffentlich: false })] }))
    // 1 Strecke + 1 von 2 Ebenen sichtbar = 2 von 3
    const knopf = screen.getByRole("button", { name: /Sichtbar \(2\/3\)/ })
    expect(knopf).toHaveAttribute("title", "Strecken 1/1 · Markierungen 1/2")
    r.unmount()
  })

  it("ein Haken blendet die Ebene aus — und es gibt KEINE Mindest-Regel wie bei Strecken", () => {
    const r = laden(projekt({ markierungen: [ebene()] }))
    dialogOeffnen()
    const dialog = screen.getByRole("dialog")
    const haken = within(dialog).getByRole("checkbox", { name: /Parkplätze/ })
    expect(haken).toBeChecked()

    fireEvent.click(haken)
    expect(useProjectStore.getState().getProject(P)?.markierungen?.[0].oeffentlich).toBe(false)
    neuRendern(r)
    // Null sichtbare Ebenen sind erlaubt: die Strecken tragen die Karte beim Kunden.
    expect(within(screen.getByRole("dialog")).getByText(/Keine Markierungen sichtbar/)).toBeInTheDocument()
    expect(within(screen.getByRole("dialog")).queryByText(/Mindestens eine Markierung/)).not.toBeInTheDocument()
  })

  it("ist GESPERRT, solange die Punkte nur als Listen-Fassung da sind — sonst ginge der Haken still verloren", async () => {
    // Nachladen hängt: die Auswahl darf in dieser Zeit nichts anbieten.
    api.getProject.mockReturnValue(new Promise(() => {}))
    laden(projekt({ markierungen: [ebene({ punkte: [], anzahl: 2 })] }))
    dialogOeffnen()
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText(/Markierungen werden geladen/)).toBeInTheDocument()
    expect(within(dialog).queryByRole("checkbox", { name: /Parkplätze/ })).not.toBeInTheDocument()
    // und die Freigabe stößt das Nachladen selbst an
    await act(async () => {})
    expect(api.getProject).toHaveBeenCalledWith(P)
  })

  it("zeigt nach einem Ladefehler „Erneut versuchen“ statt endlos zu laden", async () => {
    api.getProject.mockRejectedValueOnce(new Error("Netz weg"))
    laden(projekt({ markierungen: [ebene({ punkte: [], anzahl: 2 })] }))
    // Die Auswahl mountet erst mit dem Dialog, das Nachladen und sein Fehler kommen danach.
    dialogOeffnen()
    expect(await within(screen.getByRole("dialog")).findByRole("button", { name: /Erneut versuchen/ })).toBeInTheDocument()
  })

  it("steht auch im Veröffentlichen-Dialog VOR dem ersten Link, ein Haken blendet wieder ein", () => {
    const r = laden(projekt({ share: undefined, markierungen: [ebene({ oeffentlich: false })] }))
    fireEvent.click(screen.getByRole("button", { name: /Veröffentlichen/ }))
    const dialog = screen.getByRole("dialog")
    const haken = within(dialog).getByRole("checkbox", { name: /Parkplätze/ })
    expect(haken).not.toBeChecked()
    fireEvent.click(haken)
    expect(useProjectStore.getState().getProject(P)?.markierungen?.[0].oeffentlich).toBe(true)
    neuRendern(r)
    expect(within(screen.getByRole("dialog")).getByText(/Alle Markierungen sind sichtbar/)).toBeInTheDocument()
  })
})

