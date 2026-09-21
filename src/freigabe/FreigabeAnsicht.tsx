// Oeffentliche Ansicht der Aenderungsauswertung — dieselbe Oberflaeche wie innen.
//
// Max 2026-09-21: "das externe Dashboard 1:1 so optisch gestalten wie das interne". Deshalb
// wird hier NICHT nachgebaut, sondern dasselbe `Inhalt` gerendert, das die angemeldete Seite
// rendert. Ein Nachbau laeuft auseinander, sobald innen etwas geaendert wird; hier kann er es
// nicht, weil es derselbe Code ist.
//
// Unterschied zur angemeldeten Seite ist nur die Datenquelle: dort `/api/veraenderungen`
// hinter der Anmeldung, hier `/_share/v/<token>/daten` ohne. Die Admin-Karte "Externe
// Freigabe" faellt von selbst weg — sie haengt an `isAdmin` aus dem Kontext-Store, und der
// steht hier auf dem Standardwert false, weil ihn niemand befuellt.

import { useEffect, useState } from "react"
import { Activity } from "lucide-react"

import { Inhalt } from "@/pages/VeraenderungenPage"
import { PageContainer } from "@/components/layout/PageContainer"
import { EmptyState } from "@/components/shared/EmptyState"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { cn } from "@/lib/cn"

const FENSTER = [7, 30, 90] as const

/** Der Token steht im Pfad (/_share/v/<token>) und bleibt dort: die Daten liegen relativ
 *  dazu. Kein Token im Code, keiner im Bundle, keiner in einer Konfiguration. */
const basisPfad = window.location.pathname.replace(/\/+$/, "")

type Zustand =
  | { art: "laedt" }
  | { art: "fehler"; text: string }
  | { art: "da"; daten: VeraenderungenUebersicht }

export function FreigabeAnsicht() {
  const [tage, setTage] = useState<(typeof FENSTER)[number]>(30)
  const [zustand, setZustand] = useState<Zustand>({ art: "laedt" })

  useEffect(() => {
    let aktuell = true
    setZustand({ art: "laedt" })
    fetch(`${basisPfad}/daten?tage=${tage}`, { credentials: "omit" })
      .then((r) => {
        if (r.status === 404) throw new Error("Dieser Link ist nicht mehr gültig.")
        if (!r.ok) throw new Error(`Die Zahlen konnten nicht geladen werden (${r.status}).`)
        return r.json() as Promise<VeraenderungenUebersicht>
      })
      .then((daten) => { if (aktuell) setZustand({ art: "da", daten }) })
      .catch((e: Error) => { if (aktuell) setZustand({ art: "fehler", text: e.message }) })
    // Ein zweiter Klick auf ein anderes Fenster darf das Ergebnis des ersten nicht mehr setzen.
    return () => { aktuell = false }
  }, [tage])

  return (
    <PageContainer
      title="Änderungsverfolgung"
      description="Wie viel ändert sich täglich quellenübergreifend an Baustellen und Sperrungen: Art, Laufzeit, Vorlaufzeit."
      actions={
        // Bewusst dieselbe Auszeichnung wie in VeraenderungenPage.tsx. Aendert sich dort der
        // Umschalter, gehoert er hier nachgezogen — der Rest der Seite kommt aus `Inhalt` und
        // kann gar nicht auseinanderlaufen.
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
            {FENSTER.map((f) => (
              <button
                key={f}
                onClick={() => setTage(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tage === f ? "bg-primary-600 text-white" : "text-neutral-500 hover:bg-neutral-100",
                )}
              >
                {f} Tage
              </button>
            ))}
          </div>
        </div>
      }
    >
      {zustand.art === "laedt" ? (
        <div className="skeleton h-64 w-full rounded-2xl" />
      ) : zustand.art === "fehler" ? (
        <EmptyState icon={Activity} title="Nicht ladbar" description={zustand.text} />
      ) : (
        <Inhalt d={zustand.daten} />
      )}
    </PageContainer>
  )
}

