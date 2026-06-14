// Globaler „Daten aktualisieren"-Button im Header. Stößt denselben Sync an wie der
// DB-Tab (api.sync, Single-Run-Lock — hängt sich an einen laufenden Lauf an). Während
// des Laufs erscheint LINKS ein kompakter Ladebalken; ist alles durch (Connectoren →
// Bestandsabgleich → Auswertungen neu gefahren), wird die Seite komplett neu geladen,
// damit Auswertungen + Listen frisch sind.

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api/roadmap"
import { cn } from "@/lib/cn"

/** ISO → "heute, 14:05" / "13.06., 14:05" / "noch nie". */
function formatStamp(iso: string | null): string {
  if (!iso) return "noch nie"
  const d = new Date(iso)
  const zeit = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
  if (d.toDateString() === new Date().toDateString()) return `heute, ${zeit} Uhr`
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${zeit} Uhr`
}

export function HeaderSync() {
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  // Nur wer den Sync HIER gestartet hat, bekommt am Ende den harten Reload; wer sich
  // nur an einen laufenden Lauf anhängt, bekommt ein sanftes Daten-Refresh.
  const startedHere = useRef(false)

  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    refetchInterval: jobId ? false : 60_000,
  })

  // Läuft schon ein Sync (anderer Nutzer / DB-Tab)? → dranhängen.
  useEffect(() => {
    if (!jobId && status.data?.activeJobId) setJobId(status.data.activeJobId)
  }, [jobId, status.data?.activeJobId])

  const job = useQuery({
    queryKey: ["sync-job", jobId],
    queryFn: () => api.sync.job(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1_000 : false),
  })

  const start = useMutation({
    mutationFn: () => api.sync.start(),
    onSuccess: (j) => {
      startedHere.current = true
      setJobId(j.id)
    },
    onError: () => toast.error("Aktualisierung konnte nicht gestartet werden."),
  })

  // Abschluss: Auswertungen wurden im Rerun neu gefahren → Seite KOMPLETT neu laden.
  const handled = useRef(false)
  useEffect(() => {
    const j = job.data
    if (!j || j.status === "running" || handled.current) return
    handled.current = true
    if (j.status === "error") {
      toast.error("Aktualisierung fehlgeschlagen.")
      setJobId(null)
      handled.current = false
      return
    }
    if (startedHere.current) {
      // kurz „fertig" zeigen (Balken bei 100 %), dann harter Reload → alles frisch
      const t = setTimeout(() => window.location.reload(), 900)
      return () => clearTimeout(t)
    }
    // nur angehängt: kein Reload, aber Daten sanft auffrischen
    toast.success("Daten aktualisiert.")
    void qc.invalidateQueries()
    setJobId(null)
    handled.current = false
  }, [job.data, qc])

  const running = job.data?.status === "running" || start.isPending
  const pct = job.data?.total
    ? Math.round((job.data.done / job.data.total) * 100)
    : running
      ? 6
      : 0
  const stamp = formatStamp(status.data?.zuletztAktualisiert ?? null)

  return (
    <div className="flex items-center gap-2">
      {/* Kompakter Ladebalken links vom Button — nur während des Laufs */}
      {running ? (
        <div className="hidden w-20 md:block" aria-hidden>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${Math.max(6, pct)}%` }}
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => !running && start.mutate()}
        disabled={running}
        title={running ? "Aktualisierung läuft …" : "Alle Datenquellen neu ziehen + Auswertungen aktualisieren"}
        className="flex flex-col items-start rounded-md px-2 py-1 text-left leading-tight transition-colors hover:bg-neutral-100 disabled:cursor-default disabled:opacity-80"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          <RefreshCw className={cn("h-3.5 w-3.5", running && "animate-spin")} />
          {running ? "Aktualisiere …" : "Daten aktualisieren"}
        </span>
        <span className="text-[10px] text-neutral-400">Letzter Stand: {stamp}</span>
      </button>
    </div>
  )
}
