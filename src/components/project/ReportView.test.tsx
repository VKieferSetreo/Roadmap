// Tests für den Bericht — das Dokument, das das Haus verlässt (T-733).
//
// ReportView hängt per createPortal an document.body (nicht an #root), damit die Druck-Regel
// `body.printing-report #root { display:none }` ihn nicht mitversteckt. Deshalb wird hier
// ausschließlich über `screen` gesucht: das fragt das ganze document ab, nicht nur den
// Render-Container von Testing Library.

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ReportView } from "./ReportView"
import { fund, projekt, strecke, ungeprueteVemagsStrecke } from "@/test/fixtures"
import type { Project } from "@/types/domain"

function zeigeBericht(project: Project, routeIds?: string[]) {
  return render(<ReportView project={project} routeIds={routeIds} onClose={() => {}} />)
}

/** Die Kopfzeile unter dem Projektnamen („Berichtsdatum … · N Strecken · … km · … h … min"). */
const kopfzeile = () => screen.getByText(/Berichtsdatum/)

// ── T-721 ────────────────────────────────────────────────────────────────────────────────────
// ABSTURZ bei leerem Maßfeld. Der Bericht rief ungeschützt `t.laenge.toLocaleString()`. Die
// Anlage erlaubt das Leeren eines Feldes ausdrücklich — TransportDataForm schreibt dann bewusst
// undefined statt 0, damit die Engine keine erfundene Höhe von 0 m als gültig prüft. „Download →
// PDF-Bericht" kippte damit die ganze Ansicht in „Diese Ansicht konnte nicht geladen werden".
// MANGEL 2 der Nachprüfung: eine 0 ist ebenfalls eine Lücke, keine Angabe — einen Transport mit
// 0 m Länge oder 0 t Gewicht gibt es nicht.
describe("Bericht: Maße mit geleertem Feld (T-721)", () => {
  it("stürzt bei fehlender Höhe nicht ab und zeigt einen Strich statt einer erfundenen Null", () => {
    zeigeBericht(projekt({ transport: { hoehe: undefined } }))

    // Der Bericht steht überhaupt: Überschrift und Fußnote sind da, nicht die Fehlerseite.
    expect(screen.getByRole("heading", { name: "Turbine nach Hamburg" })).toBeInTheDocument()
    // Länge und Breite bleiben stehen — ein fehlendes Maß darf die angegebenen nicht mitreißen.
    expect(screen.getByText("24,5 m × 3 m × —")).toBeInTheDocument()
  })

  it("liest eine 0 als fehlendes Maß, nicht als Maß von null Metern", () => {
    zeigeBericht(projekt({ transport: { hoehe: 0, gesamtgewicht: 0 } }))

    expect(screen.getByText("24,5 m × 3 m × —")).toBeInTheDocument()
    // Die Gewichts-Zelle steht allein auf dem Strich; „0 t" wäre eine Angabe, die niemand gemacht hat.
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText("0 t")).not.toBeInTheDocument()
    expect(screen.queryByText(/0 m ×/)).not.toBeInTheDocument()
  })

  it("zeigt den Bericht auch dann, wenn alle vier Maße geleert sind", () => {
    zeigeBericht(
      projekt({
        transport: { laenge: undefined, breite: undefined, hoehe: undefined, gesamtgewicht: undefined },
      }),
    )

    expect(screen.getByRole("heading", { name: "Turbine nach Hamburg" })).toBeInTheDocument()
    expect(screen.getByText("— × — × —")).toBeInTheDocument()
  })
})

// ── T-727 ────────────────────────────────────────────────────────────────────────────────────
// Der Kopf widersprach der Streckenauswahl: „1 Strecke" (Auswahl beachtet) stand neben
// project.distanzKm (Auswahl ignoriert) — bei 1 von 5 gewählten Strecken also die Gesamtlänge
// aller fünf. Der Externe konnte die Kopfzahl nicht mehr aus den Abschnitten des Blattes
// nachaddieren. Die Fixture stellt genau das nach: 5 Strecken, Server-Gesamtlänge 500,4 km,
// gewählt ist die eine mit 120 km.
describe("Bericht: Kopfzeile bei Streckenauswahl (T-727)", () => {
  const nord = strecke({ name: "Nordroute", laengeKm: 120 })
  const fuenfStrecken = () =>
    projekt({
      routes: [
        nord,
        strecke({ name: "Südroute", laengeKm: 90 }),
        strecke({ name: "Umleitung Ost", laengeKm: 200 }),
        strecke({ name: "Zubringer", laengeKm: 50 }),
        strecke({ name: "Rückfahrt", laengeKm: 40 }),
      ],
      distanzKm: 500.4,
      fahrzeitMin: 600,
    })

  it("zeigt bei Teilauswahl die Kilometer der gewählten Strecke, nicht die des ganzen Projekts", () => {
    zeigeBericht(fuenfStrecken(), [nord.id])

    expect(kopfzeile()).toHaveTextContent("120 km in dieser Auswahl")
    // Die Gesamtlänge aller fünf darf im Kopf nicht mehr auftauchen.
    expect(kopfzeile()).not.toHaveTextContent("500")
    // Auch die Fahrzeit hängt an den gewählten Kilometern (120 km / 50 km/h = 2 h 24 min),
    // nicht an project.fahrzeitMin.
    expect(kopfzeile()).toHaveTextContent("2 h 24 min (geschätzt)")
  })

  it("macht die Teilauswahl kenntlich, statt nur die Zahl der gewählten Strecken zu nennen", () => {
    zeigeBericht(fuenfStrecken(), [nord.id])

    expect(kopfzeile()).toHaveTextContent("1 von 5 Strecken (Auswahl)")
  })

  it("nennt ohne Auswahl alle Strecken und die aufaddierte Länge des Blattes", () => {
    zeigeBericht(fuenfStrecken())

    // 120 + 90 + 200 + 50 + 40 — dieselben Zahlen, die unten über den Abschnitten stehen.
    // Bewusst 500 statt der Server-Zahl 500,4: der Externe hat nur das Blatt und addiert nach.
    expect(kopfzeile()).toHaveTextContent("5 Strecken")
    expect(kopfzeile()).toHaveTextContent("500 km gesamt")
    expect(kopfzeile()).not.toHaveTextContent("500,4")
  })
})

// ── T-731 / T-239 ────────────────────────────────────────────────────────────────────────────
// Der gefährlichste der drei, gefunden in der Gegenprobe: wählt man ausschließlich ungeprüfte
// VEMAGS-Strecken, schloss das Prüfen-Gate sie aus der Auswertung aus — das Blatt war leer und
// zeigte GLEICHZEITIG den grünen Kasten „Die Route ist nach aktueller Datenlage frei befahrbar".
// Ein Blatt ohne eine einzige Strecke darf keine Freigabe aussprechen. Die Freigabe selbst
// (T-239) bleibt aber gewollt und wird hier mitgehalten.
describe("Bericht: Freigabe nur mit ausgewerteter Strecke (T-731, T-239)", () => {
  const vemagsProjekt = () => {
    const routes = [
      ungeprueteVemagsStrecke({ name: "Bescheid Nord", laengeKm: 120 }),
      ungeprueteVemagsStrecke({ name: "Bescheid Süd", laengeKm: 90 }),
    ]
    return { routes, project: projekt({ routes }) }
  }

  it("spricht keine Freigabe aus, wenn keine einzige Strecke ausgewertet wurde", () => {
    const { project, routes } = vemagsProjekt()
    zeigeBericht(
      project,
      routes.map((r) => r.id),
    )

    expect(screen.queryByText("Keine Hindernisse gefunden")).not.toBeInTheDocument()
    expect(screen.queryByText(/frei befahrbar/)).not.toBeInTheDocument()
  })

  it("sagt stattdessen an, dass der Bericht keine Aussage über die Befahrbarkeit trifft", () => {
    const { project, routes } = vemagsProjekt()
    zeigeBericht(
      project,
      routes.map((r) => r.id),
    )

    expect(screen.getByText("Keine ausgewertete Strecke in diesem Bericht")).toBeInTheDocument()
    expect(screen.getByText(/trifft keine Aussage über ihre Befahrbarkeit/)).toBeInTheDocument()
  })

  it("zeigt den grünen Freigabe-Kasten sehr wohl, wenn eine freigegebene Strecke ohne Funde im Blatt steht", () => {
    zeigeBericht(projekt({ routes: [strecke({ name: "Nordroute" })], findings: [] }))

    expect(screen.getByText("Keine Hindernisse gefunden")).toBeInTheDocument()
    expect(screen.getByText(/frei befahrbar/)).toBeInTheDocument()
    // Und die Gegenansage bleibt weg — beide Kästen zusammen wären wieder ein Widerspruch.
    expect(screen.queryByText("Keine ausgewertete Strecke in diesem Bericht")).not.toBeInTheDocument()
  })

  // OFFENER FEHLER, beim Testschreiben gefunden (Stand 06.09.2026, nicht repariert):
  // Ist keine Strecke auswertbar, zählt der Kopf Funde ohne Streckenzuordnung weiter mit
  // („Funde (1)"), gelistet werden sie aber nirgends: die Sammel-Sektion „Ohne eindeutige
  // Streckenzuordnung" (T-226) greift erst ab zwei Strecken im Blatt, und Strecken-Sektionen gibt
  // es keine. Das Blatt behauptet damit einen Fund, den es nicht zeigt. Der Test beschreibt das
  // erwartete Verhalten und fällt heute — it.fails hält ihn fest, bis der Fehler behoben ist.
  it.fails("listet einen mitgezählten Fund auch dann, wenn keine Strecke auswertbar ist", () => {
    const { project, routes } = vemagsProjekt()
    zeigeBericht(
      { ...project, findings: [fund({ titel: "Bahnübergang Lehrte", routeId: undefined })] },
      routes.map((r) => r.id),
    )

    expect(screen.getByRole("heading", { name: "Funde (1)" })).toBeInTheDocument()
    expect(screen.getByText("Bahnübergang Lehrte")).toBeInTheDocument()
  })
})
