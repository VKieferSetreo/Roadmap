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
      // activeJobId SOFORT in den geteilten Cache → der DB-Tab-SyncBar hängt sich
      // ohne Wartezeit an denselben Lauf (gleiche Ansicht, synchron).
      qc.setQueryData(["sync-status"], (old: { activeJobId?: string | null } | undefined) =>
        old ? { ...old, activeJobId: j.id } : old,
      )
    },
    onError: () => toast.error("Aktualisierung konnte nicht gestartet werden."),
  })

  // Abschluss: Auswertungen wurden im Rerun neu gefahren → ALLE Queries invalidieren
  // (Projekte/Funde/Hindernisse/Glocke/Stats/Status) = komplettes Daten-Refresh in-place.
  // KEIN window.location.reload(): das lädt die aktuelle Deep-Route hart neu, die das
  // statische nginx nicht kennt → 404 (SPA-Routing). Sanftes Invalidate ist flashfrei
  // UND zeigt überall den frischen Stand.
  const handled = useRef(false)
  useEffect(() => {
    const j = job.data
    if (!j || j.status === "running" || handled.current) return
    handled.current = true
    if (j.status === "error") {
      toast.error("Aktualisierung fehlgeschlagen.")
    } else if (startedHere.current) {
      toast.success("Daten aktualisiert — Auswertungen sind frisch.")
    }
    void qc.invalidateQueries()
    setJobId(null)
    startedHere.current = false
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

      {/* Button im Format von „Problem melden". Die Stand-Zeile hängt ABSOLUT darunter,
          damit der Button selbst auf gleicher Höhe wie die übrigen Header-Buttons sitzt
          (sonst würde der Untertitel ihn nach oben schieben). min-w → Stand passt immer
          sauber drunter, egal ob „heute", Datum o.ä. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !running && start.mutate()}
          disabled={running}
          title={running ? "Aktualisierung läuft …" : "Alle Datenquellen neu ziehen + Auswertungen aktualisieren"}
          className="flex h-8 min-w-[190px] items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-default disabled:opacity-80"
        >
          <RefreshCw className={cn("h-4 w-4 text-neutral-400", running && "animate-spin")} />
          <span className="hidden sm:inline">{running ? "Aktualisiere …" : "Daten aktualisieren"}</span>
        </button>
        <span className="absolute left-0 top-full mt-1 hidden whitespace-nowrap text-[10px] leading-none text-neutral-400 sm:block">
          Letzter Stand: {stamp}
        </span>
      </div>
    </div>
  )
}
