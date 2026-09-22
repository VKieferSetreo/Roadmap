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
import { Button } from "@/components/ui/Button"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { cn } from "@/lib/cn"

const FENSTER = [7, 30, 90] as const

/** Der Token steht im Pfad (/_share/v/<token>) und bleibt dort: die Daten liegen relativ
 *  dazu. Kein Token im Code, keiner im Bundle, keiner in einer Konfiguration. */
const basisPfad = window.location.pathname.replace(/\/+$/, "")

type Zustand =
  | { art: "laedt" }
  | { art: "fehler"; text: string; endgueltig: boolean }
  | { art: "da"; daten: VeraenderungenUebersicht }

/** Ein Fehlversuch darf nicht das Ende sein.
 *
 *  Ein Empfänger meldete "Daten nicht ladbar", während mit dem Server alles in Ordnung war:
 *  ein Neustart beim Ausrollen reicht, und der eine fetch, den diese Seite absetzte, lief ins
 *  Leere. Danach stand die Seite still, bis jemand von sich aus neu lud.
 *
 *  Deshalb: dreimal versuchen mit wachsendem Abstand. Nur ein 404 (Link zurückgezogen) wird
 *  sofort als endgültig behandelt — dort hilft kein Wiederholen. */
const VERSUCHE = 3
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms))

class LinkUngueltig extends Error {}

async function ladeDaten(tage: number): Promise<VeraenderungenUebersicht> {
  let letzter: Error = new Error("Die Zahlen konnten nicht geladen werden.")
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    try {
      const r = await fetch(`${basisPfad}/daten?tage=${tage}`, { credentials: "omit" })
      if (r.status === 404) throw new LinkUngueltig("Dieser Link ist nicht mehr gültig.")
      if (r.status === 429) throw new Error("Gerade sind viele Abrufe unterwegs.")
      if (r.status === 503) throw new Error("Die Auswertung wird gerade vorbereitet.")
      if (!r.ok) throw new Error(`Die Zahlen konnten nicht geladen werden (${r.status}).`)
      return (await r.json()) as VeraenderungenUebersicht
    } catch (e) {
      if (e instanceof LinkUngueltig) throw e
      letzter = e as Error
      if (versuch < VERSUCHE) await warte(versuch * 1500)
    }
  }
  throw letzter
}

export function FreigabeAnsicht() {
  const [tage, setTage] = useState<(typeof FENSTER)[number]>(30)
  const [zustand, setZustand] = useState<Zustand>({ art: "laedt" })
  const [anlauf, setAnlauf] = useState(0)

  useEffect(() => {
    let aktuell = true
    setZustand({ art: "laedt" })
    ladeDaten(tage)
      .then((daten) => { if (aktuell) setZustand({ art: "da", daten }) })
      .catch((e: Error) => {
        if (aktuell) setZustand({ art: "fehler", text: e.message, endgueltig: e instanceof LinkUngueltig })
      })
    // Ein zweiter Klick auf ein anderes Fenster darf das Ergebnis des ersten nicht mehr setzen.
    return () => { aktuell = false }
  }, [tage, anlauf])

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
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            icon={Activity}
            title={zustand.endgueltig ? "Link nicht mehr gültig" : "Gerade nicht erreichbar"}
            description={
              zustand.endgueltig
                ? zustand.text
                : `${zustand.text} Die Seite hat es bereits mehrfach versucht.`
            }
          />
          {zustand.endgueltig ? null : (
            <Button onClick={() => setAnlauf((n) => n + 1)}>Erneut versuchen</Button>
          )}
        </div>
      ) : (
        <Inhalt d={zustand.daten} />
      )}
    </PageContainer>
  )
}

