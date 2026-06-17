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
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Signal } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api/roadmap"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import { useContextStore } from "@/store/context"
import { useProjectStore } from "@/store/projects"
import type { SyncJob } from "@/types/domain"
import { cn } from "@/lib/cn"

/** Sekunden → "noch ~3 min" / "noch ~25 s" (grobe ETA, daher ~). */
function formatEta(sec: number | null | undefined): string | null {
  if (sec == null || sec <= 0 || !Number.isFinite(sec)) return null
  if (sec < 90) return `noch ~${Math.max(5, Math.round(sec / 5) * 5)} s`
  return `noch ~${Math.round(sec / 60)} min`
}

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
  if (job.phase === "verify") {
    return { pct: 100, phaseLabel: "Daten geladen. Bestand wird mit der Datenbank abgeglichen …" }
  }
  if (job.phase === "hygiene") {
    return { pct: 100, phaseLabel: "Bestand abgeglichen. Abgelaufene Einträge werden aufgeräumt …" }
  }
  if (job.phase === "rerun") {
    return { pct: 100, phaseLabel: "Bestand gepflegt. Auswertungen werden aktualisiert …" }
  }
  return { pct, phaseLabel: "" } // import läuft
}

export function SyncBar() {
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const doneHandled = useRef<string | null>(null)
  // Job-ID des selbst gestarteten Laufs → nur DER Klicker bekommt den Toast, nicht
  // jeder nur angehängte Client (auch anderer Mandanten).
  const startedHereId = useRef<string | null>(null)

  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    // ≤15 s / bei Fokus sofort: ein laufender (globaler) Sync soll in jedem Mandanten
    // sichtbar werden. Sobald angehängt (jobId) übernimmt der 1-s-Job-Poll.
    refetchInterval: jobId ? false : 15_000,
    refetchOnWindowFocus: true,
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
      startedHereId.current = j.id
      // activeJobId SOFORT in den geteilten Cache → der Header-Sync hängt sich ohne
      // Wartezeit an denselben Lauf (gleiche Ansicht, synchron).
      qc.setQueryData(["sync-status"], (old: { activeJobId?: string | null } | undefined) =>
        old ? { ...old, activeJobId: j.id } : old,
      )
    },
    onError: () => toast.error("Aktualisierung konnte nicht gestartet werden."),
  })

  // Abschluss genau einmal je Job behandeln: melden + Daten neu laden. Der Toast nur
  // für den Initiator (sonst sähe jeder angehängte Client jedes Mandanten die Meldung).
  useEffect(() => {
    const j = job.data
    if (!j || j.status === "running" || doneHandled.current === j.id) return
    doneHandled.current = j.id
    const initiator = startedHereId.current === j.id

    if (j.status === "error") {
      if (initiator) toast.error("Aktualisierung fehlgeschlagen.")
    } else if (initiator) {
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
    // Der Sync fährt am Ende ALLE Projekte neu aus (rerun-Phase) → deren updated_at + Funde
    // ändern sich in der DB. Die Projekte liegen im Zustand-Store (nicht react-query), also
    // hier explizit neu laden, damit „Zuletzt aktualisiert" + Funde sofort den neuen Stand zeigen.
    if (j.status !== "error") void useProjectStore.getState().loadProjects()
    const t = setTimeout(() => setJobId(null), 2_500)
    return () => clearTimeout(t)
  }, [job.data, qc])

  // "Anpingen": alle Connector-Quellen live testen (erreichbar? wie viele Datensätze?), 5er-Pool.
  // Nur intern — der externe Kunden-Gateway darf /sync/ping nicht (403).
  const intern = !useContextStore((s) => s.extern)
  const [pinging, setPinging] = useState(false)
  const [pingRes, setPingRes] = useState<{ ok: number; fail: number; failed: string[] } | null>(null)

  const running = job.data?.status === "running" || start.isPending
  const { pct, phaseLabel } = progress(job.data)
  const quellen = status.data?.quellen ?? []
  const aktiveQuellen = quellen.filter((q) => q.connector)
  // Import-abgeleitetes Warnsignal: beim letzten automatischen Abruf (3×/Tag) nicht erreichbar.
  const autoFehler = aktiveQuellen.filter((q) => q.letzterStatus === "error")

  const pingAlle = async () => {
    if (aktiveQuellen.length === 0 || pinging) return
    setPinging(true)
    setPingRes(null)
    const failed: string[] = []
    let ok = 0
    let i = 0
    const arbeiter = async () => {
      while (i < aktiveQuellen.length) {
        const q = aktiveQuellen[i++]
        try {
          const r = await api.sync.ping(q.id)
          if (r.ok) ok++
          else failed.push(q.name)
        } catch {
          failed.push(q.name)
        }
      }
    }
    await Promise.all(Array.from({ length: 5 }, arbeiter))
    setPinging(false)
    setPingRes({ ok, fail: failed.length, failed })
    if (failed.length === 0) toast.success(`Alle ${ok} Quellen erreichbar.`)
    else toast.error(`${failed.length} von ${aktiveQuellen.length} Quellen nicht erreichbar.`)
  }
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
        <div className="flex shrink-0 items-center gap-2">
          {intern ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void pingAlle()}
              disabled={pinging || aktiveQuellen.length === 0}
              title="Alle Quellen live anpingen: erreichbar?"
            >
              <Signal className={cn("h-4 w-4", pinging && "animate-pulse")} />
              {pinging ? "Pinge …" : "Anpingen"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => start.mutate()}
            disabled={running}
          >
            <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} />
            {running ? "Aktualisiere …" : "Aktualisieren"}
          </Button>
        </div>
      </div>

      {/* Erreichbarkeit: Live-Ping-Ergebnis (manuell) ODER der letzte automatische Abruf (3×/Tag). */}
      {intern && pingRes ? (
        pingRes.fail === 0 ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-severity-hinweis-strong">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Alle {pingRes.ok} Quellen erreichbar.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs font-medium text-severity-kritisch">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {pingRes.fail} von {pingRes.ok + pingRes.fail} Quellen nicht erreichbar:{" "}
              <span className="font-normal">{pingRes.failed.join(", ")}</span>
            </span>
          </p>
        )
      ) : intern && autoFehler.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-severity-kritisch">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Letzter automatischer Abruf: {autoFehler.length} Quelle{autoFehler.length === 1 ? "" : "n"} mit
            Fehler — <span className="font-normal">{autoFehler.map((q) => q.name).join(", ")}</span>
          </span>
        </p>
      ) : null}

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
            <div className="flex flex-col gap-0.5">
              <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
                <span className="truncate">Lädt: {job.data.current.name}</span>
              </p>
              {job.data.phase === "import" && formatEta(job.data.etaSeconds) ? (
                <p className="pl-[18px] text-[11px] tabular-nums text-neutral-400">{formatEta(job.data.etaSeconds)}</p>
              ) : null}
            </div>
          ) : null}
          {geschrieben > 0 ? (
            <p className="text-[11px] tabular-nums text-neutral-400">
              {geschrieben.toLocaleString("de-DE")} Einträge in die Datenbank geschrieben
            </p>
          ) : null}
          {job.data.verify ? (
            <p className="text-[11px] tabular-nums text-neutral-400">
              {job.data.verify.geprueft.toLocaleString("de-DE")} Einträge geprüft ·{" "}
              {job.data.verify.geaendert.toLocaleString("de-DE")} geändert
              {job.data.verify.neu ? ` (${job.data.verify.neu.toLocaleString("de-DE")} neu)` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
