// DB-Tab-Kopf: zeigt je Datenquelle den letzten Abruf + globalen "Zuletzt
// aktualisiert"-Stand und bietet den "Aktualisieren"-Button (alle Quellen neu
// ziehen → abgelaufene aufräumen → Auswertungen neu fahren). Fortschrittsbalken
// pollt den Sync-Job. Nach Abschluss werden Hindernis-, Fund- und Glocken-
// Queries invalidiert, damit die Oberfläche den neuen Stand zeigt.
//
// Jeder eingeloggte Nutzer darf den Sync auslösen (Backend serialisiert per
// Single-Run-Lock — paralleles Klicken hängt sich an denselben Lauf an).

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Database, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api/roadmap"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import type { SyncJob } from "@/types/domain"
import { cn } from "@/lib/cn"

function formatStamp(iso: string | null): string {
  if (!iso) return "noch nie"
  const d = new Date(iso)
  const heute = new Date()
  const sameDay = d.toDateString() === heute.toDateString()
  const zeit = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
  if (sameDay) return `heute, ${zeit} Uhr`
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${zeit} Uhr`
}

// Der Balken bildet den EHRLICHEN Lade-Fortschritt ab: geladene Quellen / alle
// Quellen. job.done steigt im Backend erst NACHDEM eine Quelle komplett gezogen
// UND in die DB geschrieben wurde (sequenziell). Nach dem Laden folgen Aufräumen
// (hygiene) + Auswertungen (rerun) als sichtbare Abschluss-Schritte bei 100 %.
function progress(job: SyncJob | undefined): { pct: number; phaseLabel: string } {
  if (!job) return { pct: 0, phaseLabel: "" }
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0
  if (job.status === "error") return { pct: 100, phaseLabel: "Fehlgeschlagen" }
  if (job.status === "done") return { pct: 100, phaseLabel: "Fertig" }
  if (job.phase === "hygiene") {
    return { pct: 100, phaseLabel: "Daten geschrieben — abgelaufene Einträge werden aufgeräumt …" }
  }
  if (job.phase === "rerun") {
    return { pct: 100, phaseLabel: "Daten geschrieben — Auswertungen werden aktualisiert …" }
  }
  return { pct, phaseLabel: "" } // import läuft
}

export function SyncBar() {
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const doneHandled = useRef<string | null>(null)

  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    refetchInterval: jobId ? false : 60_000,
  })

  // Läuft beim Laden schon ein Sync (anderer Nutzer)? → dranhängen.
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
      setJobId(j.id)
      doneHandled.current = null
    },
    onError: () => toast.error("Aktualisierung konnte nicht gestartet werden."),
  })

  // Abschluss genau einmal je Job behandeln: melden + Daten neu laden.
  useEffect(() => {
    const j = job.data
    if (!j || j.status === "running" || doneHandled.current === j.id) return
    doneHandled.current = j.id

    if (j.status === "error") {
      toast.error("Aktualisierung fehlgeschlagen.")
    } else {
      const neu = j.rerun?.benachrichtigungen ?? 0
      const importiert = j.runs.reduce((s, r) => s + (r.stats?.neu ?? 0), 0)
      toast.success(
        `Aktualisiert · ${importiert} neue Einträge` +
          (neu > 0 ? ` · ${neu} neue Benachrichtigung${neu === 1 ? "" : "en"}` : ""),
      )
    }
    void qc.invalidateQueries({ queryKey: ["sync-status"] })
    void qc.invalidateQueries({ queryKey: ["obstacles-alle"] })
    void qc.invalidateQueries({ queryKey: ["db-findings"] })
    void qc.invalidateQueries({ queryKey: ["notif-unread"] })
    void qc.invalidateQueries({ queryKey: ["notif-list"] })
    const t = setTimeout(() => setJobId(null), 2_500)
    return () => clearTimeout(t)
  }, [job.data, qc])

  const running = job.data?.status === "running" || start.isPending
  const { pct, phaseLabel } = progress(job.data)
  const quellen = status.data?.quellen ?? []
  const aktiveQuellen = quellen.filter((q) => q.connector)
  // Laufende Summe der bereits geschriebenen Einträge (neu + aktualisiert) über
  // die abgeschlossenen Quellen — macht sichtbar, dass wirklich geschrieben wird.
  const geschrieben =
    job.data?.runs.reduce((s, r) => s + (r.stats?.neu ?? 0) + (r.stats?.aktualisiert ?? 0), 0) ?? 0

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Datenquellen</p>
            <p className="text-xs text-neutral-500">
              Zuletzt aktualisiert: {formatStamp(status.data?.zuletztAktualisiert ?? null)}
              {aktiveQuellen.length > 0
                ? ` · ${aktiveQuellen.length} aktive Quelle${aktiveQuellen.length === 1 ? "" : "n"}`
                : ""}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => start.mutate()}
          disabled={running}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} />
          {running ? "Aktualisiere …" : "Aktualisieren"}
        </Button>
      </div>

      {/* Fortschritt — Quellen werden SEQUENZIELL gezogen: eine wird komplett geladen
          UND geschrieben, bevor die nächste startet. Der Balken = geladene / alle. */}
      {jobId && job.data ? (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-700">
              {job.data.status === "running" && job.data.phase === "import"
                ? `Datenquellen werden geladen — ${job.data.done} / ${job.data.total}`
                : phaseLabel || `${job.data.done} / ${job.data.total} Quellen geladen`}
            </span>
            <span className="tabular-nums text-neutral-400">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                job.data.status === "error" ? "bg-severity-kritisch-text" : "bg-primary-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {job.data.status === "running" && job.data.current ? (
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
              <span className="truncate">Lädt: {job.data.current.name}</span>
            </p>
          ) : null}
          {geschrieben > 0 ? (
            <p className="text-[11px] tabular-nums text-neutral-400">
              {geschrieben.toLocaleString("de-DE")} Einträge in die Datenbank geschrieben
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
