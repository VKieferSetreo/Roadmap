// Auswertungs-Dashboard — die Flaeche, auf die der Kunde in der Demo schaut (T-733: erste
// Frontend-Tests des Projekts).
//
// Der Zustand kommt NICHT aus einem Mock, sondern aus dem echten Zustand-Store: `analysis[id]`
// wird per setState direkt gesetzt, genau so, wie runAnalysis() es zur Laufzeit tut. Damit
// prueft der Test dieselbe Verdrahtung, die in der Anwendung greift — ein umbenanntes Feld
// faellt hier auf, ein gemocktes useProjectStore haette es durchgelassen.

import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { DashboardTab } from "./DashboardTab"
import { useProjectStore } from "@/store/projects"
import type { Project, ProjectRoute } from "@/types/domain"

const PROJEKT_ID = "p-a2-nacht"

/** Eine auswertbare Strecke: >= 2 Punkte und nicht die ungepruefte VEMAGS-Sorte (T-593). */
const strecke = (over: Partial<ProjectRoute> = {}): ProjectRoute => ({
  id: "r1",
  name: "Hinfahrt A2",
  points: [
    { lat: 52.4, lng: 9.7 },
    { lat: 52.5, lng: 9.9 },
  ],
  farbe: "#2563EB",
  source: "datei",
  ...over,
})

const projekt = (over: Partial<Project> = {}): Project => ({
  id: PROJEKT_ID,
  name: "A2 Nachtfahrt",
  status: "entwurf",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
  routes: [strecke()],
  transport: { laenge: 24.5, breite: 3, hoehe: 4.2, gesamtgewicht: 92 },
  zeitraum: {},
  findings: [],
  distanzKm: 128.4,
  fahrzeitMin: 154,
  ...over,
})

const zeige = (p: Project) =>
  render(
    <MemoryRouter>
      <DashboardTab project={p} />
    </MemoryRouter>,
  )

/** Alles nachladbare (die per lazy() geholten Diagramme) einmal ankommen lassen. Ohne das
 *  belegt ein „steht nicht da" nur, dass es NOCH nicht da ist. */
const nachladenAbwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 60)) })

beforeEach(() => {
  useProjectStore.setState({ projects: [], analysis: {} })
})

// T-722 — der schlimmste Demo-Blocker: waehrend die Auswertung lief, stand im gruenen Kasten
// „Keine Hindernisse gefunden", und Sekunden spaeter erschienen 40 Funde. Die Waechter-Bedingung
// liess „running" durch; danach war die Fundliste leer und der Positiv-Befund aus T-239 griff.
// Gegenstueck ist T-239 selbst: nach einem ABGESCHLOSSENEN Lauf ohne Funde ist die Entwarnung
// richtig und muss stehenbleiben.
describe("DashboardTab — Ergebnis-Aussage waehrend und nach dem Lauf", () => {
  it("sagt waehrend des Laufs, dass er laeuft, statt Entwarnung zu geben", () => {
    useProjectStore.setState({
      analysis: {
        [PROJEKT_ID]: { running: true, progress: 34, step: "Brücken & Tunnel werden geprüft …" },
      },
    })

    zeige(projekt({ status: "analyse", findings: [] }))

    expect(screen.getByText("Auswertung läuft …")).toBeInTheDocument()
    expect(screen.getByText("Brücken & Tunnel werden geprüft …")).toBeInTheDocument()
    expect(screen.getByText("Die Funde erscheinen, sobald der Lauf abgeschlossen ist.")).toBeInTheDocument()
    expect(screen.queryByText("Keine Hindernisse gefunden")).toBeNull()
    expect(
      screen.queryByText("Auf der ausgewerteten Strecke wurden keine relevanten Restriktionen gefunden."),
    ).toBeNull()
  })

  it("laesst auch die Diagramme waehrend des Laufs schweigen, statt „Keine Funde\" zu behaupten", async () => {
    useProjectStore.setState({
      analysis: { [PROJEKT_ID]: { running: true, progress: 12, step: "Strecken werden geladen …" } },
    })

    zeige(projekt({ status: "analyse", findings: [] }))
    await nachladenAbwarten()

    // „Keine Funde" ist die Aussage der beiden Diagramme bei leerer Menge — waehrend des ersten
    // Laufs dieselbe falsche Entwarnung wie der gruene Kasten.
    expect(screen.queryAllByText("Keine Funde")).toHaveLength(0)
    expect(screen.getByText("Auswertung läuft …")).toBeInTheDocument()
  })

  it("gibt die Entwarnung erst, wenn der Lauf abgeschlossen ist (T-239)", async () => {
    // Kein analysis-Eintrag = kein laufender Lauf, Status „fertig" = der Lauf ist durch.
    zeige(projekt({ status: "fertig", findings: [] }))

    expect(await screen.findByText("Keine Hindernisse gefunden")).toBeInTheDocument()
    expect(
      screen.getByText("Auf der ausgewerteten Strecke wurden keine relevanten Restriktionen gefunden."),
    ).toBeInTheDocument()
    expect(screen.queryByText("Auswertung läuft …")).toBeNull()
  })
})

// OFFENER BEFUND, beim Schreiben dieser Tests gefunden — der Produktionscode ist bewusst NICHT
// angefasst. T-722 hat den gruenen Kasten und die Diagramme stillgelegt, solange der erste Lauf
// noch nichts geliefert hat. Die vier Kennzahl-Kacheln daruber machen dieselbe verfruehte Aussage
// weiter: `streckeKm`/`fahrzeitMin` fallen bei genau einer Strecke auf `project.distanzKm ?? 0`
// bzw. `project.fahrzeitMin ?? 0` zurueck, und beide Felder setzt erst der ABGESCHLOSSENE Lauf
// (store/projects.ts, finish()). Waehrend der Auto-Auswertung nach dem Streckenimport steht dort
// also „Strecke 0 km" und „Fahrzeit (Schätzung) 0 h 0 min" — fuer eine Strecke, die der Disponent
// gerade selbst hochgeladen hat. Das ist die erfundene Null aus T-721, nur an der Nachbarkachel:
// dort wurde sie zum Strich, hier steht sie noch.
//
// Der Test beschreibt das GEWUENSCHTE Verhalten und ist mit `it.fails` markiert: er ist heute rot
// und haelt den Befund fest. Wird die Stelle repariert, schlaegt er an und die Markierung muss weg.
describe("DashboardTab — Kennzahlen waehrend des ersten Laufs (offener Befund)", () => {
  it.fails("nennt waehrend des ersten Laufs keine erfundene Strecke und Fahrzeit von null", () => {
    useProjectStore.setState({
      analysis: { [PROJEKT_ID]: { running: true, progress: 20, step: "Geometrie wird abgefahren …" } },
    })

    // Erster Lauf: distanzKm/fahrzeitMin sind noch nicht gesetzt — die Strecke selbst liegt vor.
    zeige(projekt({ status: "analyse", findings: [], distanzKm: undefined, fahrzeitMin: undefined }))

    expect(screen.queryByText("0 h 0 min")).toBeNull()
    // Die km-Kachel steht als Wert direkt neben ihrer Beschriftung.
    expect(screen.getByText("Strecke").nextElementSibling?.textContent).not.toBe("0 km")
  })
})

// T-723: ein fehlgeschlagener Lauf setzt den Status im Store zurueck auf „entwurf" (projects.ts,
// fail()). Der Reiter sah damit aus wie „noch nie gestartet" — „Noch keine Auswertung, laden Sie
// die Strecke hoch" —, obwohl der Disponent Strecke UND Auswertung hinter sich hatte. Die Folge
// war ein zweiter Upload derselben Strecke.
//
// T-467 legt einen ZWEITEN Fall in dasselbe error-Feld: HTTP 409, fuer dieses Projekt laeuft
// bereits eine Auswertung (Doppelklick, zweiter Disponent, Nachtlauf). Das ist kein Fehlschlag,
// sondern warten — und muss deshalb anders dastehen und einen anderen Knopf tragen.
describe("DashboardTab — leerer Reiter nach einem gescheiterten oder kollidierten Lauf", () => {
  const MIT_FEHLER = "Analyse fehlgeschlagen. Server nicht erreichbar oder Fehler in der Engine."
  const MIT_KOLLISION = "Für dieses Projekt läuft bereits eine Auswertung. Bitte kurz warten."

  it("nennt den fehlgeschlagenen Lauf beim Namen und schickt nicht zurueck zum Hochladen", () => {
    useProjectStore.setState({
      analysis: {
        [PROJEKT_ID]: { running: false, progress: 0, step: "Fehlgeschlagen", error: MIT_FEHLER },
      },
    })

    zeige(projekt({ status: "entwurf", findings: [] }))

    expect(screen.getByRole("heading", { name: "Letzte Auswertung fehlgeschlagen" })).toBeInTheDocument()
    expect(screen.queryByText("Noch keine Auswertung")).toBeNull()
    // Der Nutzer HAT hochgeladen — das muss dastehen, sonst laedt er ein zweites Mal hoch.
    expect(screen.getByText(/erneutes Hochladen ist nicht nötig/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Erneut auswerten/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Zur Eingabe/ })).toBeNull()
  })

  it("behandelt die Kollision mit einem fremden Lauf als warten, nicht als Fehlschlag (T-467)", () => {
    useProjectStore.setState({
      analysis: {
        [PROJEKT_ID]: { running: false, progress: 0, step: "Fehlgeschlagen", error: MIT_KOLLISION },
      },
    })

    zeige(projekt({ status: "entwurf", findings: [] }))

    expect(screen.getByRole("heading", { name: "Auswertung läuft bereits" })).toBeInTheDocument()
    expect(screen.queryByText("Letzte Auswertung fehlgeschlagen")).toBeNull()
    expect(screen.getByText(/Kurz warten und dann aktualisieren/)).toBeInTheDocument()
    // Der Fehlschlag-Zweig setzt den rohen Store-Text vor seine Erklaerung. Steht er hier, ist die
    // Kollision faelschlich als Fehlschlag formuliert.
    expect(screen.queryByText(/Bitte kurz warten\./)).toBeNull()
    // Ein zweiter Start liefe sofort in denselben 409 — hier hilft nur neu laden.
    expect(screen.getByRole("button", { name: /Aktualisieren/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Erneut auswerten/ })).toBeNull()
  })
})
