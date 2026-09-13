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

const { api, toast } = vi.hoisted(() => ({
  api: { getProject: vi.fn(), patchProject: vi.fn(), runAnalysis: vi.fn(), listProjects: vi.fn(), projectCount: vi.fn() },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/api/roadmap", () => ({ api }))
vi.mock("@/store/datasource", () => ({ isLive: () => true }))
vi.mock("sonner", () => ({ toast }))

import { useMarkierungenNachladen, useProjectStore } from "@/store/projects"
import { ApiError } from "@/api/client"
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
  api.runAnalysis.mockReset()
  api.listProjects.mockReset()
  api.listProjects.mockResolvedValue([])
  api.projectCount.mockResolvedValue({ aktiv: 0, archiviert: 0, topLevel: 0 })
  Object.values(toast).forEach((f) => f.mockReset())
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

describe("Sperre in den Store-Aktionen, nicht nur im Rendern (T-744)", () => {
  // loadProjects kann den Stand jederzeit zurück in die Listenform kippen, während ein Dialog oder ein
  // Umbenennen-Formular noch offen ist. Deren Callbacks dürfen dann nichts ändern — sonst ließe der Sync
  // das Feld weg, und die Änderung wäre still verloren. Bei der Freigabe: Oberfläche „ausgeblendet",
  // Kunde sieht die Ebene weiter.
  it.each([
    ["addMarkierungsEbenen", () => useProjectStore.getState().addMarkierungsEbenen(P, [{ name: "Neu", punkte: punkte(1) }])],
    ["removeMarkierungsEbene", () => useProjectStore.getState().removeMarkierungsEbene(P, "e1")],
    ["updateMarkierungsEbene", () => useProjectStore.getState().updateMarkierungsEbene(P, "e1", { oeffentlich: false })],
  ])("%s ändert im Listen-Stand nichts und meldet false", (_name, aktion) => {
    setzeStore([{ ...projekt(), id: P, markierungen: [listenEbene(3)] }])
    const vorher = JSON.stringify(imStore()?.markierungen)
    expect(aktion()).toBe(false)
    expect(JSON.stringify(imStore()?.markierungen)).toBe(vorher)
    expect(toast.error).toHaveBeenCalled()
  })

  it("lässt dieselben Aktionen zu, sobald die Punkte vollständig sind", () => {
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(3)] }])
    expect(useProjectStore.getState().updateMarkierungsEbene(P, "e1", { oeffentlich: false })).toBe(true)
    expect(imStore()?.markierungen?.[0].oeffentlich).toBe(false)
  })
})

describe("Auswertung starten, während eine Ebenen-Änderung noch im Sync-Fenster hängt (T-744)", () => {
  it("schickt die Markierungen im Sofort-Flush mit, statt sie zu verlieren", async () => {
    vi.useFakeTimers()
    api.runAnalysis.mockReturnValue(new Promise(() => {})) // Lauf hängt, uns interessiert nur der Flush
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(2)] }])
    useProjectStore.getState().updateMarkierungsEbene(P, "e1", { oeffentlich: false })
    // Noch innerhalb der 600 ms startet die Auswertung.
    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    const flush = api.patchProject.mock.calls.find(([, patch]) => "markierungen" in patch)
    expect(flush).toBeDefined()
    expect(flush![1].markierungen[0].oeffentlich).toBe(false)
  })
})

describe("Analyse-Flush ohne ausstehenden Sync (T-744, Review)", () => {
  it("schickt KEINE Markierungen — sonst überschriebe ein veralteter Tab still fremde Ebenen und Freigaben", async () => {
    vi.useFakeTimers()
    api.runAnalysis.mockReturnValue(new Promise(() => {}))
    // Tab mit altem Stand: keine Ebenen im Store, nichts steht zur Synchronisation an.
    setzeStore([{ ...projekt(), id: P, markierungen: [] }])
    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    const [, flush] = api.patchProject.mock.calls[0]
    // Ohne ausstehenden Sync keine Markierungen im Flush (bis zu 8 MB je Auswertungsstart gespart).
    expect(flush).not.toHaveProperty("markierungen")
    expect(flush).toHaveProperty("routes")
  })
})

describe("T-745: Flush vor der Auswertung prüft die version", () => {
  // Früher lief der Flush bewusst versionslos (T-467/T-501). Ein veralteter Tab überschrieb damit beim
  // Auswertungsstart still eine Freigabe, die ein Kollege gerade geändert hatte.

  it("schickt die version mit", async () => {
    vi.useFakeTimers()
    api.runAnalysis.mockReturnValue(new Promise(() => {}))
    setzeStore([{ ...projekt(), id: P, version: 7, markierungen: [] }])
    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    expect(api.patchProject.mock.calls[0][1]).toMatchObject({ version: 7 })
  })

  it("bei 409 des Flush: KEINE Auswertung, kein rotes ‚fehlgeschlagen', Hinweis und Neuladen", async () => {
    vi.useFakeTimers()
    api.patchProject.mockRejectedValueOnce(new ApiError({ message: "Konflikt", code: "HTTP_409" }, 409))
    setzeStore([{ ...projekt(), id: P, version: 3, markierungen: [] }])
    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    expect(api.runAnalysis).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/zwischenzeitlich geändert.*erneut/))
    expect(api.listProjects).toHaveBeenCalled()
    // Kein Fehler-Marker: sonst zeigte die Karte ‚Letzte Auswertung fehlgeschlagen' oder ‚läuft bereits'.
    expect(useProjectStore.getState().analysis[P]).toBeUndefined()
  })

  it("ein 409 der Auswertung SELBST bleibt ‚läuft bereits' (T-467 unverändert)", async () => {
    vi.useFakeTimers()
    api.runAnalysis.mockRejectedValueOnce(new ApiError({ message: "läuft", code: "HTTP_409" }, 409))
    setzeStore([{ ...projekt(), id: P, version: 3, markierungen: [] }])
    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    expect(api.runAnalysis).toHaveBeenCalled()
    expect(useProjectStore.getState().analysis[P]?.error).toMatch(/läuft bereits eine Auswertung/)
    expect(api.listProjects).not.toHaveBeenCalled()
  })

  it("wartet auf den eigenen laufenden Sync und nimmt DESSEN version — kein Konflikt mit sich selbst (T-501)", async () => {
    vi.useFakeTimers()
    let antworten!: (v: { version: number }) => void
    api.patchProject.mockImplementationOnce(() => new Promise((r) => { antworten = r }))
    api.runAnalysis.mockReturnValue(new Promise(() => {}))
    setzeStore([{ ...projekt(), id: P, version: 4, markierungen: [volleEbene(1)] }])

    useProjectStore.getState().updateTransport(P, { hoehe: 4.1 })
    await vi.advanceTimersByTimeAsync(700) // Sync-Timer ist abgelaufen, der PATCH ist UNTERWEGS
    expect(api.patchProject).toHaveBeenCalledTimes(1)

    useProjectStore.getState().runAnalysis(P)
    await vi.advanceTimersByTimeAsync(10)
    // Der Flush darf NICHT mit der alten version 4 losschicken, solange der eigene PATCH läuft.
    expect(api.patchProject).toHaveBeenCalledTimes(1)

    antworten({ version: 5 })
    await vi.advanceTimersByTimeAsync(10)
    expect(api.patchProject).toHaveBeenCalledTimes(2)
    expect(api.patchProject.mock.calls[1][1]).toMatchObject({ version: 5 })
  })
})

describe("Sync abgelehnt: Oberfläche darf nicht weiter den ungespeicherten Stand zeigen (T-744, Review)", () => {
  it("holt bei einer Server-Ablehnung (500) den echten Stand", async () => {
    vi.useFakeTimers()
    api.patchProject.mockRejectedValueOnce(new ApiError({ message: "Interner Fehler", code: "HTTP_500" }, 500))
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(2)] }])
    useProjectStore.getState().updateMarkierungsEbene(P, "e1", { oeffentlich: false })
    await vi.advanceTimersByTimeAsync(700)
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/nicht angenommen/))
    expect(api.listProjects).toHaveBeenCalled()
  })

  it("lädt ohne Verbindung NICHT neu (würde ebenso scheitern), sagt aber ehrlich, dass nichts gespeichert ist", async () => {
    vi.useFakeTimers()
    api.patchProject.mockRejectedValueOnce(new ApiError({ message: "Keine Verbindung", code: "NETWORK_ERROR" }, 0))
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(2)] }])
    useProjectStore.getState().updateMarkierungsEbene(P, "e1", { oeffentlich: false })
    await vi.advanceTimersByTimeAsync(700)
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/nicht gespeichert werden/))
    expect(api.listProjects).not.toHaveBeenCalled()
  })
})

describe("413: zu großer Stand (T-744)", () => {
  it("zeigt die Meldung des Servers statt „Verbindung prüfen“ und lädt neu", async () => {
    vi.useFakeTimers()
    const meldung = "Die Daten sind zu groß (höchstens 20 MB je Anfrage)."
    api.patchProject.mockRejectedValueOnce(new ApiError({ message: meldung, code: "PAYLOAD_TOO_LARGE" }, 413))
    setzeStore([{ ...projekt(), id: P, markierungen: [volleEbene(2)] }])
    useProjectStore.getState().updateTransport(P, { hoehe: 4.4 })
    await vi.advanceTimersByTimeAsync(700)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(meldung))
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("Verbindung prüfen"))
    // Neu laden verwirft den zu großen Stand — sonst scheiterte JEDER weitere Sync wieder mit 413.
    expect(api.listProjects).toHaveBeenCalled()
  })
})

