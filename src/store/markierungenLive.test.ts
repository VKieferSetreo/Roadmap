// Der LIVE-Pfad der Markierungs-Ebenen (T-744). Genau diese Stellen waren kaputt und kein Test hat es
// bemerkt, weil alle bisherigen Tests im Demo-Modus liefen — dort gibt es keine beschnittene
// Projektliste. Gefunden wurde es erst gegen ein echtes Backend:
//
//   1. Nach einem Reload wurde GET /api/projects/<id> NIE abgesetzt: der Nachlade-Effekt feuerte,
//      bevor die Liste im Store stand, und danach nicht mehr. Punkte unsichtbar, Block gesperrt.
//   2. Schlug das Nachladen einmal fehl, blieb der Block für immer auf „wird geladen".
//
// Dazu der Schutz, der schon stand und hier festgehalten wird: solange die Punkte fehlen, darf ein
// Speichern das Feld `markierungen` nicht mitschicken — sonst ersetzt es alle Punkte durch leere
// Arrays (gegen echte Postgres gemessen: 5 Punkte vorher, 0 danach).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { MarkierungsEbene, Project } from "@/types/domain"

const { api } = vi.hoisted(() => ({
  api: { getProject: vi.fn(), patchProject: vi.fn() },
}))
vi.mock("@/api/roadmap", () => ({ api }))
vi.mock("@/store/datasource", () => ({ isLive: () => true }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { useMarkierungenNachladen, useProjectStore } from "@/store/projects"
import { projekt } from "@/test/fixtures"

const P = "p-live"
const punkte = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 52 + i / 1000, lng: 10, name: `P${i}` }))

/** So liefert GET /api/projects eine Ebene: ohne Punkte, mit `anzahl`. */
const listenEbene = (n: number): MarkierungsEbene => ({ id: "e1", name: "Parkplätze", farbe: "#0F766E", punkte: [], anzahl: n })
/** So liefert GET /api/projects/:id dieselbe Ebene: vollständig, ohne `anzahl`. */
const volleEbene = (n: number): MarkierungsEbene => ({ id: "e1", name: "Parkplätze", farbe: "#0F766E", punkte: punkte(n) })

function setzeStore(projects: Project[]) {
  useProjectStore.setState({ projects, markierungenLadefehler: {} })
}
const imStore = () => useProjectStore.getState().getProject(P)

beforeEach(() => {
  api.getProject.mockReset()
  api.patchProject.mockReset()
  api.patchProject.mockImplementation(async (_id: string, patch: { version?: number }) => ({ version: (patch.version ?? 0) + 1 }))
})
afterEach(() => vi.useRealTimers())

describe("Nachladen der Markierungs-Punkte", () => {
  it("lädt nach, sobald die Projektliste ankommt — auch wenn der Hook VORHER gemountet wurde (Reload)", async () => {
    api.getProject.mockResolvedValue({ ...projekt(), id: P, markierungen: [volleEbene(3)] })
    // Reload/Direktlink: der Hook läuft, bevor loadProjects fertig ist — Store noch leer.
    setzeStore([])
    renderHook(() => useMarkierungenNachladen(P))
    expect(api.getProject).not.toHaveBeenCalled()

    // Jetzt kommt die Liste an, mit der beschnittenen Ebene.
    act(() => setzeStore([{ ...projekt(), id: P, markierungen: [listenEbene(3)] }]))

    await waitFor(() => expect(api.getProject).toHaveBeenCalledWith(P))
    await waitFor(() => expect(imStore()?.markierungen?.[0].punkte).toHaveLength(3))
    expect(imStore()?.markierungen?.[0].anzahl).toBeUndefined()
  })

  it("lädt NICHT nach, wenn die Punkte schon vollständig da sind", async () => {
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(3)] }])
    renderHook(() => useMarkierungenNachladen(P))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getProject).not.toHaveBeenCalled()
  })

  it("übernimmt nur die Markierungen, eine lokal frischere Änderung bleibt stehen", async () => {
    api.getProject.mockResolvedValue({ ...projekt(), id: P, name: "Stand vom Server", markierungen: [volleEbene(2)] })
    setzeStore([{ ...projekt(), id: P, name: "Lokal umbenannt", markierungen: [listenEbene(2)] }])
    await useProjectStore.getState().loadProjectDetail(P)
    expect(imStore()?.name).toBe("Lokal umbenannt")
    expect(imStore()?.markierungen?.[0].punkte).toHaveLength(2)
  })

  it("merkt sich einen Ladefehler und räumt ihn beim nächsten erfolgreichen Versuch weg", async () => {
    setzeStore([{ ...projekt(), id: P, markierungen: [listenEbene(2)] }])
    api.getProject.mockRejectedValueOnce(new Error("Netz weg"))
    await useProjectStore.getState().loadProjectDetail(P)
    expect(useProjectStore.getState().markierungenLadefehler[P]).toBe(true)
    // Die Punkte fehlen weiter — der Block bleibt gesperrt, zeigt aber jetzt „Erneut versuchen".
    expect(imStore()?.markierungen?.[0].anzahl).toBe(2)

    api.getProject.mockResolvedValueOnce({ ...projekt(), id: P, markierungen: [volleEbene(2)] })
    await useProjectStore.getState().loadProjectDetail(P)
    expect(useProjectStore.getState().markierungenLadefehler[P]).toBeUndefined()
    expect(imStore()?.markierungen?.[0].punkte).toHaveLength(2)
  })
})

describe("Speichern, solange die Punkte fehlen", () => {
  it("schickt `markierungen` NICHT mit — sonst würden alle Punkte gelöscht", async () => {
    vi.useFakeTimers()
    setzeStore([{ ...projekt(), id: P, markierungen: [listenEbene(5)] }])
    useProjectStore.getState().updateTransport(P, { hoehe: 4.5 })
    await vi.advanceTimersByTimeAsync(700) // Sync-Debounce 600 ms
    expect(api.patchProject).toHaveBeenCalledTimes(1)
    const [, patch] = api.patchProject.mock.calls[0]
    expect(patch).not.toHaveProperty("markierungen")
    expect(patch.transport).toMatchObject({ hoehe: 4.5 })
  })

  it("schickt `markierungen` mit, sobald die Punkte vollständig sind", async () => {
    vi.useFakeTimers()
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(5)] }])
    useProjectStore.getState().updateTransport(P, { hoehe: 4.5 })
    await vi.advanceTimersByTimeAsync(700)
    const [, patch] = api.patchProject.mock.calls[0]
    expect(patch.markierungen[0].punkte).toHaveLength(5)
  })
})
