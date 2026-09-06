// Fund-Karte auf der Karte (Popup + DB-Dialog) — die zweite Flaeche, in der der Kunde in der
// Demo steht (T-733: erste Frontend-Tests des Projekts).
//
// Geprueft wird der Zuordnungs-Vorbehalt: was die Karte sagt, wenn die Engine nicht belegen
// konnte, dass ein Bauwerk wirklich auf der gefahrenen Strecke liegt.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FindingCard, type FindingCardProps } from "./FindingCard"

const karte = (over: Partial<FindingCardProps> = {}) =>
  render(
    <FindingCard
      kategorie="bruecke"
      titel="Durchfahrtshöhe 3,80 m"
      severity="kritisch"
      subtitle="Brücke · km 93,4 · A4"
      beschreibung="Bauwerk mit begrenzter Durchfahrtshöhe."
      {...over}
    />,
  )

// T-692 (Max fragte am 06.09.2026, was das heisst) und T-699.
//
// Die Engine haengt an einen Fund `Zuordnung: "nicht nachweisbar"`, wenn sie nicht belegen
// konnte, dass das Bauwerk auf der gefahrenen Strecke liegt (server/src/engine/index.js: zuord
// === "unbestimmt"); der Fund bleibt trotzdem stehen und zaehlt in die Bewertung — ihn
// wegzulassen waere gefaehrlicher. Auf der Karte stand dieser Vorbehalt in der Sprache der
// Engine. Jetzt traegt ihn ein Schild in der Sprache des Disponenten, und wo die Engine zusaetzlich
// `Gilt` setzt (nur wenn das Bauwerk GENAU eine der beiden Aussagen traegt, sonst schweigt sie),
// steht die massgebende Metrik im Klartext dabei.
describe("FindingCard — Zuordnungs-Vorbehalt", () => {
  it("zeigt bei nicht nachweisbarer Zuordnung das Schild „Streckenbezug unbestätigt\"", () => {
    karte({ detail: { Zuordnung: "nicht nachweisbar", Durchfahrtshöhe: "3,80 m" } })

    expect(screen.getByText("Streckenbezug unbestätigt")).toBeInTheDocument()
  })

  it("sagt im Klartext, wofuer die Angabe gilt, wenn die Engine die Metrik kennt", () => {
    karte({
      detail: { Zuordnung: "nicht nachweisbar", Gilt: "beim Befahren des Bauwerks" },
    })

    expect(screen.getByText("Die Angabe gilt beim Befahren des Bauwerks.")).toBeInTheDocument()
  })

  it("nennt ebenso das Unterqueren, wenn das Bauwerk eine Durchfahrtshöhe traegt", () => {
    karte({
      detail: { Zuordnung: "nicht nachweisbar", Gilt: "beim Unterqueren des Bauwerks" },
    })

    expect(screen.getByText("Die Angabe gilt beim Unterqueren des Bauwerks.")).toBeInTheDocument()
  })

  it("schweigt ohne den Vorbehalt — weder Schild noch Metrik-Satz", () => {
    // „Gilt" allein ist kein Vorbehalt: die Aussage haengt am Zweifel, nicht umgekehrt. Ein Schild
    // „Streckenbezug unbestätigt" an einem sauber zugeordneten Fund wuerde ihn entwerten.
    karte({ detail: { Durchfahrtshöhe: "3,80 m", Gilt: "beim Unterqueren des Bauwerks" } })

    expect(screen.queryByText("Streckenbezug unbestätigt")).toBeNull()
    expect(screen.queryByText(/Die Angabe gilt/)).toBeNull()
  })

  it("führt „Gilt\" und „Zuordnung\" nicht zusätzlich als rohe Feldzeilen auf", () => {
    karte({
      detail: {
        Zuordnung: "nicht nachweisbar",
        Gilt: "beim Befahren des Bauwerks",
        Durchfahrtshöhe: "3,80 m",
      },
    })

    // Kontrolle: normale Detailwerte stehen sehr wohl im Raster — sonst belegten die beiden
    // Nichts-Erwartungen darunter nur, dass gar kein Raster da ist.
    expect(screen.getByText("Durchfahrtshöhe")).toBeInTheDocument()
    expect(screen.getByText("3,80 m")).toBeInTheDocument()

    // Beide stehen als Schild bzw. Satz darunter; ein zweites Mal als Feldzeile waere Dopplung.
    expect(screen.queryByText("Gilt")).toBeNull()
    expect(screen.queryByText("Zuordnung")).toBeNull()
  })
})
