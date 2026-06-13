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

function progress(job: SyncJob | undefined): { pct: number; label: string } {
  if (!job) return { pct: 0, label: "" }
  if (job.status === "done") return { pct: 100, label: "Fertig" }
  if (job.status === "error") return { pct: 100, label: "Fehlgeschlagen" }
  if (job.phase === "rerun") return { pct: 95, label: "Auswertungen werden neu gefahren …" }
  if (job.phase === "hygiene") return { pct: 88, label: "Abgelaufene Einträge werden aufgeräumt …" }
  const base = job.total ? Math.round((job.done / job.total) * 80) : 10
  return { pct: Math.max(8, base), label: job.current ? `Lade ${job.current.name} …` : "Wird vorbereitet …" }
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
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1_200 : false),
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
  const { pct, label } = progress(job.data)
  const quellen = status.data?.quellen ?? []
  const aktiveQuellen = quellen.filter((q) => q.connector)

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

      {/* Quellen-Chips */}
      {quellen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {quellen.map((q) => (
            <span
              key={q.id}
              title={
                q.connector
                  ? `${q.name} · zuletzt: ${formatStamp(q.letzterAbruf ?? null)}`
                  : `${q.name} · kein aktiver Connector`
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                q.connector
                  ? "border-neutral-200 bg-white text-neutral-600"
                  : "border-neutral-100 bg-neutral-50 text-neutral-400",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  q.connector ? "bg-status-done-text" : "bg-neutral-300",
                )}
              />
              {q.name.replace(/\s*\(.*\)\s*$/, "")}
            </span>
          ))}
        </div>
      ) : null}

      {/* Fortschritt */}
      {jobId && job.data ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                job.data.status === "error" ? "bg-severity-kritisch-text" : "bg-primary-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">{label}</p>
        </div>
      ) : null}
    </Card>
  )
}
