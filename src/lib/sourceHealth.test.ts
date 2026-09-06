// Warn-Indikator der Datenquellen (T-733: erste Frontend-Tests des Projekts).
//
// Die Zähl-Logik lebt im Hook selbst, deshalb wird der Hook gefahren — mit renderHook und einem
// eigenen QueryClient je Test, damit sich die Fälle nicht über den ["sync-status"]-Cache
// gegenseitig die Daten reichen. Kein echtes HTTP: api.sync.status ist ersetzt.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { createElement, type ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { SyncSourceStatus, SyncStatus } from "@/types/domain"

// vi.hoisted, weil die vi.mock-Fabrik läuft, bevor normale const-Deklarationen initialisiert sind.
const { statusMock, storeState } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  storeState: { mode: "live" as string, extern: false },
}))

vi.mock("@/api/roadmap", () => ({ api: { sync: { status: statusMock } } }))
// Die Zustand-Stores werden nur mit einem Selektor gelesen — ein Stellvertreter, der den Selektor
// auf einen festen Zustand anwendet, reicht und hält den Test frei von Store-Interna.
vi.mock("@/store/datasource", () => ({
  useDataSourceStore: (sel: (s: { mode: string }) => unknown) => sel({ mode: storeState.mode }),
}))
vi.mock("@/store/context", () => ({
  useContextStore: (sel: (s: { extern: boolean }) => unknown) => sel({ extern: storeState.extern }),
}))

import { useSourceHealth, zaehltFuerIndikator } from "./sourceHealth"

/** Baut eine Quelle wie sie GET /api/sync/status liefert; nur das Nötige wird gesetzt. */
function quelle(over: Partial<SyncSourceStatus> & { id: string }): SyncSourceStatus {
  return {
    name: `Quelle ${over.id}`,
    aktiv: true,
    connector: true,
    vollbestand: false,
    letzterStatus: "ok",
    ...over,
  }
}

function antwort(quellen: SyncSourceStatus[]): SyncStatus {
  return { quellen, connectorAnzahl: quellen.length, zuletztAktualisiert: null, activeJobId: null }
}

/** Frischer QueryClient je Test — sonst trägt der geteilte ["sync-status"]-Cache die Quellen des
 *  vorigen Falls in den nächsten. */
function neuerClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapperFuer(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

/** Hook fahren und WARTEN, bis die Antwort wirklich im Cache liegt.
 *  Ohne dieses Warten wäre der Vor-Lade-Zustand {0, 0} — und weil mehrere Fälle hier genau 0/0
 *  erwarten, würde der Test grün, ohne die Zähl-Logik je gesehen zu haben. */
async function health(quellen: SyncSourceStatus[]) {
  statusMock.mockResolvedValue(antwort(quellen))
  const client = neuerClient()
  const { result } = renderHook(() => useSourceHealth(), { wrapper: wrapperFuer(client) })
  await waitFor(() => expect(client.getQueryData(["sync-status"])).toBeDefined())
  return result
}

beforeEach(() => {
  storeState.mode = "live"
  storeState.extern = false
  statusMock.mockReset()
})

// T-715: gezählt wurde auf q.connector, aber NICHT auf q.aktiv. Stillgelegte Quellen (aktiv=false)
// plant der Worker seit T-694 nicht mehr ein — ihr letzter Import-Status bleibt für immer
// eingefroren. Gemessen am 05.09.2026: 4 von 71 nicht erreichbar, davon 3 (0121, 0151, 0159)
// stillgelegt und auf warn festgenagelt. Der Indikator konnte nie wieder auf 0 gehen.
describe("useSourceHealth — stillgelegte Quellen", () => {
  it("zählt eine stillgelegte Quelle mit Warnung weder als nicht erreichbar noch überhaupt mit", async () => {
    const result = await health([quelle({ id: "0121", aktiv: false, letzterStatus: "warn" })])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 0, total: 0 })
    })
  })

  it("lässt den Indikator wieder auf null gehen, wenn nur noch Stillgelegte warnen", async () => {
    // Der gemessene Stand vom 05.09.2026, aber ohne den einen echten Ausfall: 3 stillgelegte
    // Warnungen und 68 gesunde aktive Quellen. Vor dem Fix stand hier 3 statt 0.
    const result = await health([
      quelle({ id: "0121", aktiv: false, letzterStatus: "warn" }),
      quelle({ id: "0151", aktiv: false, letzterStatus: "warn" }),
      quelle({ id: "0159", aktiv: false, letzterStatus: "warn" }),
      ...Array.from({ length: 68 }, (_, i) => quelle({ id: `a${i}`, letzterStatus: "ok" })),
    ])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 0, total: 68 })
    })
  })
})

// T-679: gezählt wurde nur "error", der seltenste Fall. Gemessen am 05.09.2026 stand der Indikator
// auf grün, obwohl sechs Quellen seit Wochen nichts mehr lieferten: 62 ok, 5 warn, 1 partial,
// 0 error. Halb geschafft oder mit Warnung beendet heißt für den Nutzer dasselbe: nicht frisch.
describe("useSourceHealth — aktive Quellen", () => {
  it("meldet eine aktive Quelle mit Warnung, Fehler oder Teil-Abruf als nicht erreichbar", async () => {
    const result = await health([
      quelle({ id: "w", letzterStatus: "warn" }),
      quelle({ id: "e", letzterStatus: "error" }),
      quelle({ id: "p", letzterStatus: "partial" }),
    ])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 3, total: 3 })
    })
  })

  it("zählt eine aktive Quelle mit ok nur in die Gesamtzahl", async () => {
    const result = await health([quelle({ id: "ok1", letzterStatus: "ok" })])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 0, total: 1 })
    })
  })

  it("zählt eine Quelle ohne lauffähigen Connector nirgends mit — auch nicht bei Fehler", async () => {
    const result = await health([quelle({ id: "ohne", connector: false, letzterStatus: "error" })])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 0, total: 0 })
    })
  })

  it("hält den einen echten Ausfall zwischen stillgelegten und gesunden Quellen fest", async () => {
    const result = await health([
      quelle({ id: "0121", aktiv: false, letzterStatus: "warn" }),
      quelle({ id: "0151", aktiv: false, letzterStatus: "warn" }),
      quelle({ id: "echt", letzterStatus: "error" }),
      quelle({ id: "ohneConnector", connector: false, letzterStatus: "error" }),
      quelle({ id: "gesund", letzterStatus: "ok" }),
    ])
    await waitFor(() => {
      expect(result.current).toEqual({ unreachable: 1, total: 2 })
    })
  })
})

describe("useSourceHealth — wann überhaupt gefragt wird", () => {
  // Der externe Kunden-Gateway darf /sync/status nicht abfragen (403), und im Demo-Modus gibt es
  // keinen Server, der antworten könnte.
  it("fragt den Sync-Status im externen Kunden-Login gar nicht erst ab", async () => {
    storeState.extern = true
    statusMock.mockResolvedValue(antwort([quelle({ id: "x", letzterStatus: "error" })]))
    const { result } = renderHook(() => useSourceHealth(), { wrapper: wrapperFuer(neuerClient()) })
    await new Promise((r) => setTimeout(r, 20))
    expect(statusMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ unreachable: 0, total: 0 })
  })

  it("fragt im Demo-Modus nicht ab", async () => {
    storeState.mode = "demo"
    statusMock.mockResolvedValue(antwort([quelle({ id: "x", letzterStatus: "error" })]))
    renderHook(() => useSourceHealth(), { wrapper: wrapperFuer(neuerClient()) })
    await new Promise((r) => setTimeout(r, 20))
    expect(statusMock).not.toHaveBeenCalled()
  })
})

// T-733: Die beiden Tests, die hier standen, prüften das Set-Literal gegen sich selbst
// (`[...OHNE_FRISCHE_DATEN].sort()` gleich der abgeschriebenen Liste). Sie fingen nichts, was der
// Verhaltenstest oben nicht schon fängt, wären aber bei jeder korrekten Erweiterung des Sets rot
// geworden — ein Test, der richtige Änderungen bestraft und falsche durchlässt. Entfernt.
//
// An ihrer Stelle die Funktion, an der es wirklich hängt. Sie ist am 06.09.2026 aus zwei
// wortgleichen Kopien zusammengeführt worden (sourceHealth und SyncBar), nachdem eine
// Mutationsprobe zeigte: der ursprüngliche T-715-Fehler, allein in der Kopie wieder eingebaut,
// ließ die gesamte Suite grün.
describe("zaehltFuerIndikator (T-715/T-733)", () => {
  it("zählt eine Quelle mit Connector, die im Register aktiv ist", () => {
    expect(zaehltFuerIndikator({ connector: true, aktiv: true })).toBe(true)
  })

  it("zählt eine stillgelegte Quelle NICHT — ihr Status ist für immer eingefroren", () => {
    expect(zaehltFuerIndikator({ connector: true, aktiv: false })).toBe(false)
  })

  it("zählt eine Quelle ohne lauffähigen Connector nicht — es gibt keinen Abruf zu bewerten", () => {
    expect(zaehltFuerIndikator({ connector: false, aktiv: true })).toBe(false)
    expect(zaehltFuerIndikator({ aktiv: true })).toBe(false)
  })

  // Fehlt das Feld, ist die Quelle nicht stillgelegt: `aktiv` kam erst mit dem Register dazu, und
  // ein alter Datensatz ohne das Feld darf nicht stillschweigend aus dem Nenner fallen.
  it("behandelt eine fehlende aktiv-Angabe als aktiv", () => {
    expect(zaehltFuerIndikator({ connector: true })).toBe(true)
  })
})
