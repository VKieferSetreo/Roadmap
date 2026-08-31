// Eine Strecke in ein anderes Projekt kopieren (T-658).
//
// Max, 31.08.2026: "bau pro Strecke noch einen Kopier-Button mit ein, dass man die Strecke
// anklicken kann mit Button und dann kommt ne Maske, wo man auswählen kann mit Suchleiste, in
// welches Projekt man das kopieren will, mit Standard auf dem aktuellen."
//
// KOPIEREN, NICHT VERSCHIEBEN: die Strecke bleibt, wo sie ist. Eine Variante einer Route in einem
// zweiten Projekt zu prüfen ist der Normalfall (andere Fahrzeugmaße, anderer Zeitraum), und dabei
// darf das Original nicht wandern.
//
// STANDARD IST DAS AKTUELLE PROJEKT, wie gewünscht — dort ist "kopieren" gleichbedeutend mit
// "duplizieren", und genau das ist der zweithäufigste Fall: eine Strecke abwandeln, ohne die
// bestehende zu verlieren.

import { useMemo, useState } from "react"
import { Copy, Loader2, Search, X } from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { cn } from "@/lib/cn"
import type { Project, ProjectRoute } from "@/types/domain"

interface Props {
  route: ProjectRoute
  /** Projekt, in dem die Strecke gerade liegt — Vorauswahl. */
  quelle: Project
  onSchliessen: () => void
}

export function RouteCopyDialog({ route, quelle, onSchliessen }: Props) {
  const projects = useProjectStore((s) => s.projects)
  const addRoute = useProjectStore((s) => s.addRoute)
  const [suche, setSuche] = useState("")
  const [zielId, setZielId] = useState(quelle.id)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const alle = projects.filter((p) => !p.archiviertAm)
    const gefiltert = q ? alle.filter((p) => p.name.toLowerCase().includes(q)) : alle
    // Das aktuelle Projekt immer oben: es ist die Vorauswahl, und wer es sucht, soll nicht
    // scrollen müssen.
    return [...gefiltert].sort((a, b) => (a.id === quelle.id ? -1 : b.id === quelle.id ? 1 : 0))
  }, [projects, suche, quelle.id])

  const ziel = projects.find((p) => p.id === zielId)

  function kopieren() {
    if (!ziel) return
    setLaeuft(true)
    setFehler(null)
    try {
      // Im selben Projekt braucht die Kopie einen eigenen Namen, sonst stehen zwei gleich
      // heißende Strecken untereinander und niemand weiß, welche gemeint ist.
      const name = zielId === quelle.id ? `${route.name} (Kopie)` : route.name
      // Die Farbe vergibt der Store selbst — sie hängt an der Position im Zielprojekt, nicht an
      // der Strecke. Zwei Kopien in einem Projekt bekämen sonst dieselbe.
      addRoute(zielId, {
        name,
        points: route.points,
        waypoints: route.waypoints,
        source: route.source,
      })
      onSchliessen()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Kopieren fehlgeschlagen")
      setLaeuft(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <button type="button" aria-label="Schließen" onClick={onSchliessen}
              className="absolute inset-0 cursor-default bg-neutral-900/40" />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-3">
          <Copy className="h-4 w-4 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-900">Strecke kopieren</h2>
            <p className="truncate text-[12px] text-neutral-500">{route.name}</p>
          </div>
          <button type="button" onClick={onSchliessen} aria-label="Schließen"
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-neutral-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              autoFocus
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Projekt suchen …"
              className="h-9 w-full rounded-md border border-neutral-300 pl-8 pr-3 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {treffer.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-neutral-400">Kein Projekt gefunden.</li>
          ) : (
            treffer.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setZielId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    p.id === zielId ? "bg-primary-50 font-medium text-primary-800" : "text-neutral-700 hover:bg-neutral-100",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.id === quelle.id && (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                      aktuell
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

        {fehler && (
          <p role="alert" className="shrink-0 border-t border-neutral-200 px-4 py-2 text-[12px] text-severity-kritisch">
            {fehler}
          </p>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-neutral-500">
            {zielId === quelle.id ? "Wird als Kopie in diesem Projekt angelegt." : `Nach „${ziel?.name ?? ""}"`}
          </p>
          <button
            type="button"
            onClick={kopieren}
            disabled={laeuft || !ziel}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {laeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Kopieren
          </button>
        </footer>
      </div>
    </div>
  )
}
