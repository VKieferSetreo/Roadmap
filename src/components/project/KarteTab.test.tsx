// Die Karte darf keine Entwarnung zeigen, wo keine Auswertung stattgefunden hat (T-744).
//
// Gemessen am 13.09.: Sobald ein Projekt Markierungen hatte, übersprang KarteTab den ganzen
// Leerzustand — bei „noch nicht ausgewertet", „Lauf fehlgeschlagen" und „Kollision" stand auf der
// Karte stattdessen „0 Kritisch · 0 Warnung · 0 Hinweis". Genau das hatten T-722/T-723 abgestellt.
//
// Die Karte selbst (Leaflet) ist ersetzt: jsdom rechnet kein Layout, und geprüft wird hier nur,
// WELCHER Zweig rendert — Leerzustand mit ehrlicher Aussage oder Karte mit Kennzahlen.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { MarkierungsEbene, Project } from "@/types/domain"

vi.mock("@/components/map/RouteMap", () => ({
  RouteMap: ({ children }: { children?: React.ReactNode }) => <div data-testid="karte">{children}</div>,
}))
vi.mock("@/api/roadmap", () => ({ api: { getProject: vi.fn(() => new Promise(() => {})), viewerRoutes: vi.fn(() => new Promise(() => {})) } }))

import { KarteTab } from "./KarteTab"
import { useProjectStore } from "@/store/projects"
import { projekt as basis, strecke } from "@/test/fixtures"

const P = "p-karte-gate"
const ebene: MarkierungsEbene = { id: "e1", name: "Parkplätze", farbe: "#0F766E", punkte: [{ lat: 52, lng: 10 }] }

function zeige(over: Partial<Project>, fehler?: string) {
  const project: Project = { ...basis(), id: P, status: "entwurf", findings: [], ...over }
  useProjectStore.setState({
    projects: [project],
    analysis: fehler ? { [P]: { running: false, progress: 0, step: "Fehlgeschlagen", error: fehler } } : {},
  })
  return render(
    <MemoryRouter>
      <KarteTab project={project} />
    </MemoryRouter>,
  )
}

beforeEach(() => useProjectStore.setState({ projects: [], analysis: {} }))

describe("KarteTab: keine falsche Entwarnung durch Markierungen", () => {
  it("nie ausgewertet, MIT Markierungen: ehrlicher Leerzustand statt Karte mit 0/0/0", () => {
    zeige({ routes: [strecke()], markierungen: [ebene] })
    expect(screen.getByText(/Noch keine Auswertung/)).toBeInTheDocument()
    expect(screen.queryByText(/0 Kritisch/)).not.toBeInTheDocument()
  })

  it("Lauf fehlgeschlagen, MIT Markierungen: der Fehler steht da, nicht die Entwarnung", () => {
    zeige(
      { routes: [strecke()], markierungen: [ebene] },
      "Analyse fehlgeschlagen. Server nicht erreichbar oder Fehler in der Engine.",
    )
    expect(screen.getByText(/Letzte Auswertung fehlgeschlagen/)).toBeInTheDocument()
    expect(screen.queryByTestId("karte")).not.toBeInTheDocument()
  })

  it("NUR Markierungen, keine Strecke: Karte erscheint (T-739), aber ohne 0/0/0-Kennzahlen", () => {
    zeige({ routes: [], markierungen: [ebene] })
    expect(screen.getByTestId("karte")).toBeInTheDocument()
    // Ohne Strecke wurde nichts geprüft — „0 Kritisch" wäre dieselbe falsche Aussage.
    expect(screen.queryByText(/Kritisch/)).not.toBeInTheDocument()
  })

  it("Gegenprobe: ausgewertet, MIT Markierungen: Karte samt Kennzahlen wie gehabt", () => {
    zeige({ routes: [strecke()], markierungen: [ebene], status: "fertig" })
    expect(screen.getByTestId("karte")).toBeInTheDocument()
    expect(screen.getAllByText(/Kritisch/).length).toBeGreaterThan(0)
  })
})
