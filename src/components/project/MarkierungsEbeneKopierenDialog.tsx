// Eine Markierungs-Ebene in ein anderes Projekt kopieren (T-742) — Gegenstück zu RouteCopyDialog
// (T-658). Kopieren, nicht verschieben; Vorauswahl ist das aktuelle Projekt, dort heißt die Kopie
// „(Kopie)". Drei Dinge sind anders als bei Strecken:
//
// 1. DAS ZIEL WIRD NACHGELADEN. Andere Projekte stehen nur als Listen-Fassung im Store, ihre Punkte
//    fehlen. Auf so einem Stand verweigert der Store jede Änderung (T-744) — zu Recht, sonst ginge sie
//    beim Speichern verloren. Also erst die Punkte des Ziels holen, dann einfügen.
// 2. DIE GRENZEN GELTEN FÜRS ZIEL (1.000 Punkte, 50 Ebenen, 8 MB), nicht für die Quelle.
// 3. DIE FREIGABE WANDERT MIT. Eine für den Kunden ausgeblendete Ebene bleibt in der Kopie
//    ausgeblendet. Sonst brächte Kopieren eine interne Ebene still in den Kundenlink eines anderen
//    Projekts — das Gegenteil dessen, was die Freigabe verspricht.

import { useMemo, useState } from "react"
import { Copy, EyeOff, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { useProjectStore } from "@/store/projects"
import { grenzText, pruefeMarkierungsGrenzen } from "@/lib/markierungsGrenzen"
import { cn } from "@/lib/cn"
import { markierungenUnvollstaendig, type MarkierungsEbene, type Project } from "@/types/domain"

interface Props {
  ebene: MarkierungsEbene
  /** Projekt, in dem die Ebene gerade liegt — Vorauswahl. */
  quelle: Project
  onSchliessen: () => void
}

export function MarkierungsEbeneKopierenDialog({ ebene, quelle, onSchliessen }: Props) {
  const projects = useProjectStore((s) => s.projects)
  const [suche, setSuche] = useState("")
  const [zielId, setZielId] = useState(quelle.id)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const alle = projects.filter((p) => !p.archiviertAm)
    const gefiltert = q ? alle.filter((p) => p.name.toLowerCase().includes(q)) : alle
    return [...gefiltert].sort((a, b) => (a.id === quelle.id ? -1 : b.id === quelle.id ? 1 : 0))
  }, [projects, suche, quelle.id])

  const ziel = projects.find((p) => p.id === zielId)
  const ausgeblendet = ebene.oeffentlich === false

  async function kopieren() {
    if (!ziel) return
    setLaeuft(true)
    setFehler(null)
    const { loadProjectDetail, addMarkierungsEbenen } = useProjectStore.getState()
    // Zustand im Store frisch lesen, nicht aus dem Render-Schnappschuss — zwischen Öffnen und Klick
    // kann loadProjects gelaufen sein.
    const zielJetzt = () => useProjectStore.getState().getProject(zielId)

    if (zielJetzt() && markierungenUnvollstaendig(zielJetzt()!)) {
      await loadProjectDetail(zielId)
      if (!zielJetzt() || markierungenUnvollstaendig(zielJetzt()!)) {
        setFehler("Die Markierungen des Zielprojekts konnten nicht geladen werden. Bitte versuchen Sie es erneut.")
        setLaeuft(false)
        return
      }
    }

    const verstoss = pruefeMarkierungsGrenzen(zielJetzt()?.markierungen ?? [], [ebene])
    if (verstoss) {
      setFehler(`${grenzText(verstoss)} Bitte wählen Sie ein anderes Projekt.`)
      setLaeuft(false)
      return
    }

    const ok = addMarkierungsEbenen(zielId, [
      {
        name: zielId === quelle.id ? `${ebene.name} (Kopie)` : ebene.name,
        fileName: ebene.fileName,
        punkte: ebene.punkte,
        ...(ausgeblendet ? { oeffentlich: false } : {}),
      },
    ])
    if (!ok) {
      // Der Store hat abgelehnt und das selbst gemeldet (Stand kippte gerade zurück in die Listenform).
      setLaeuft(false)
      return
    }
    onSchliessen()
  }

  return (
    <Dialog open onClose={onSchliessen} size="sm">
      <DialogHeader title="Ebene kopieren" subtitle={ebene.name} onClose={onSchliessen} />

      <div className="border-b border-neutral-200 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            autoFocus
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Projekt suchen …"
            aria-label="Zielprojekt suchen"
            className="h-9 w-full rounded-md border border-neutral-300 pl-8 pr-3 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Zielprojekt">
        {treffer.length === 0 ? (
          <li className="px-3 py-6 text-center text-[13px] text-neutral-400">Kein Projekt gefunden.</li>
        ) : (
          treffer.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setZielId(p.id)
                  setFehler(null)
                }}
                aria-pressed={p.id === zielId}
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

      {ausgeblendet ? (
        <p className="flex items-center gap-1.5 border-t border-neutral-200 px-4 py-2 text-[12px] text-neutral-500">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          Die Ebene ist für den Empfänger ausgeblendet, die Kopie ebenfalls.
        </p>
      ) : null}

      {fehler ? (
        <p role="alert" className="border-t border-neutral-200 px-4 py-2 text-[12px] text-severity-kritisch">
          {fehler}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-[12px] text-neutral-500">
          {zielId === quelle.id ? "Wird als Kopie in diesem Projekt angelegt." : `Nach „${ziel?.name ?? ""}"`}
        </p>
        <Button onClick={() => void kopieren()} disabled={laeuft || !ziel} size="sm">
          {laeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          Kopieren
        </Button>
      </div>
    </Dialog>
  )
}
