// Bug-Report-Triage (nur Setreo-Admin): alle gemeldeten Probleme einsehen,
// Status setzen (offen → in Arbeit → erledigt/verworfen), interne Notiz pflegen,
// löschen. Erreichbar über /debug ("Roadmap-Debugging") + Sidebar (nur Admin).

import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Bug,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  EyeOff,
  Link2,
  ListPlus,
  MapPin,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Textarea } from "@/components/ui/Input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { cn } from "@/lib/cn"
import { safeHref } from "@/lib/safeHref"
import { formatDateTimeDE, formatRelativeDE } from "@/lib/format"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import { HIDE_REASON_LABEL, type BugReport, type BugReportStatus, type HiddenFindingsResponse, type HideReason, type SourceRequest } from "@/types/domain"

const STATUS_META: Record<
  BugReportStatus,
  { label: string; variant: "warning" | "default" | "success" | "muted" }
> = {
  offen: { label: "Offen", variant: "warning" },
  in_arbeit: { label: "In Arbeit", variant: "default" },
  erledigt: { label: "Erledigt", variant: "success" },
  verworfen: { label: "Verworfen", variant: "muted" },
}

type Filter = "alle" | BugReportStatus
const FILTERS: Filter[] = ["alle", "offen", "in_arbeit", "erledigt", "verworfen"]

export function DebugPage() {
  const isAdmin = useContextStore((s) => s.isAdmin)
  const ctxLoaded = useContextStore((s) => s.loaded)
  const mode = useDataSourceStore((s) => s.mode)

  const [reports, setReports] = useState<BugReport[]>([])
  const [zaehler, setZaehler] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<Filter>("offen")
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"bugs" | "hidden" | "quellen">("bugs")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.bugReports.list(filter === "alle" ? undefined : filter)
      setReports(res.reports)
      setZaehler(res.zaehler)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Konnte Bug-Reports nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (mode === "live" && isAdmin) void load()
  }, [load, mode, isAdmin])

  if (mode === "demo") {
    return (
      <div className="h-full overflow-y-auto">
        <PageContainer title="Debugging" description="Bug-Reports der Nutzer.">
          <EmptyState
            icon={Bug}
            title="Nur mit Live-Datenbank"
            description="Die Bug-Report-Triage braucht das Backend — im Demo-Modus nicht verfügbar."
          />
        </PageContainer>
      </div>
    )
  }
  if (ctxLoaded && !isAdmin) return <Navigate to="/" replace />

  const gesamt = Object.values(zaehler).reduce((a, b) => a + b, 0)

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Roadmap-Debugging"
        description="Von Nutzern gemeldete Probleme + manuell ausgeblendete Funde — einsehen und auswerten."
      >
        <Tabs value={view} onValueChange={(v) => setView(v as "bugs" | "hidden" | "quellen")} className="mb-4">
          <TabsList>
            <TabsTrigger value="bugs">
              <Bug className="h-4 w-4" /> Bug-Reports
            </TabsTrigger>
            <TabsTrigger value="quellen">
              <ListPlus className="h-4 w-4" /> Quellen-Vorschläge
            </TabsTrigger>
            <TabsTrigger value="hidden">
              <EyeOff className="h-4 w-4" /> Ausgeblendete Funde
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "hidden" ? (
          <HiddenFindingsTab />
        ) : view === "quellen" ? (
          <SourceRequestsTab />
        ) : (
        <div className="flex flex-col gap-4">
          {/* Filter-Leiste + Aktualisieren */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const count = f === "alle" ? gesamt : (zaehler[f] ?? 0)
              const active = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  {f === "alle" ? "Alle" : STATUS_META[f].label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums",
                      active ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-500",
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Aktualisieren
            </Button>
          </div>

          {/* Liste */}
          {reports.length === 0 ? (
            <EmptyState
              icon={Bug}
              title={loading ? "Lädt…" : "Keine Bug-Reports"}
              description={loading ? undefined : "In dieser Ansicht ist aktuell nichts gemeldet."}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((r) => (
                <ReportCard key={r.id} report={r} onChanged={load} />
              ))}
            </div>
          )}
        </div>
        )}
      </PageContainer>
    </div>
  )
}

function ReportCard({ report, onChanged }: { report: BugReport; onChanged: () => void }) {
  const [showKontext, setShowKontext] = useState(false)
  const [editNotiz, setEditNotiz] = useState(false)
  const [notizDraft, setNotizDraft] = useState(report.notiz ?? "")
  const [busy, setBusy] = useState(false)
  const meta = STATUS_META[report.status]

  const setStatus = async (status: BugReportStatus) => {
    if (status === report.status) return
    setBusy(true)
    try {
      await api.bugReports.patch(report.id, { status })
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Status konnte nicht geändert werden.")
    } finally {
      setBusy(false)
    }
  }

  const saveNotiz = async () => {
    setEditNotiz(false)
    if (notizDraft === (report.notiz ?? "")) return
    try {
      await api.bugReports.patch(report.id, { notiz: notizDraft.trim() || null })
      toast.success("Notiz gespeichert.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Notiz konnte nicht gespeichert werden.")
    }
  }

  const remove = async () => {
    if (!window.confirm("Diesen Bug-Report wirklich löschen?")) return
    try {
      await api.bugReports.remove(report.id)
      toast.success("Gelöscht.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Kopf: Status + Metadaten + Löschen */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant} size="sm">
            {meta.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
            <User className="h-3.5 w-3.5 text-neutral-400" /> {report.email}
          </span>
          {report.tenantSlug ? (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Building2 className="h-3.5 w-3.5 text-neutral-400" /> {report.tenantSlug}
            </span>
          ) : null}
          <span
            className="inline-flex items-center gap-1 text-xs text-neutral-400"
            title={formatDateTimeDE(report.createdAt)}
          >
            <Clock className="h-3.5 w-3.5" /> {formatRelativeDE(report.createdAt)}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void remove()}
            aria-label="Bug-Report löschen"
            className="text-neutral-400 hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Beschreibung */}
        <p className="whitespace-pre-wrap text-sm text-neutral-800">{report.beschreibung}</p>

        {/* View / Route */}
        {report.viewPath ? (
          <p className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-500">
            <MapPin className="h-3.5 w-3.5 text-neutral-400" /> {report.viewPath}
          </p>
        ) : null}

        {/* Seiten-Screenshot beim Melden (was der Nutzer sah) — Klick öffnet groß */}
        {report.screenshot ? (
          <a
            href={safeHref(report.screenshot)}
            target="_blank"
            rel="noreferrer"
            title="Screenshot in neuem Tab öffnen"
            className="block w-fit"
          >
            <img
              src={report.screenshot}
              alt="Seiten-Screenshot beim Melden"
              className="max-h-56 rounded-md border border-neutral-200 object-contain"
            />
          </a>
        ) : null}

        {/* Kontext-Snapshot — einklappbar */}
        <div className="rounded-md border border-neutral-200 bg-neutral-50/60">
          <button
            type="button"
            onClick={() => setShowKontext((s) => !s)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:text-neutral-900"
          >
            {showKontext ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Technischer Kontext
          </button>
          {showKontext ? (
            <pre className="max-h-72 overflow-auto border-t border-neutral-200 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
              {JSON.stringify(report.kontext ?? {}, null, 2)}
            </pre>
          ) : null}
        </div>

        {/* Interne Notiz */}
        <div className="border-t border-neutral-100 pt-3">
          {editNotiz ? (
            <div className="flex flex-col gap-2">
              <Textarea
                autoFocus
                rows={2}
                value={notizDraft}
                onChange={(e) => setNotizDraft(e.target.value)}
                placeholder="Interne Notiz (z.B. Ursache, Fix-Plan, Ticket-Verweis) …"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditNotiz(false)}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={() => void saveNotiz()}>
                  Notiz speichern
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setNotizDraft(report.notiz ?? "")
                setEditNotiz(true)
              }}
              className="text-left text-xs text-neutral-500 hover:text-neutral-800"
            >
              {report.notiz ? (
                <span className="whitespace-pre-wrap">📝 {report.notiz}</span>
              ) : (
                <span className="italic text-neutral-400">+ Interne Notiz hinzufügen</span>
              )}
            </button>
          )}
        </div>

        {/* Status-Aktionen */}
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3">
          {(Object.keys(STATUS_META) as BugReportStatus[]).map((s) => (
            <Button
              key={s}
              variant={s === report.status ? "default" : "outline"}
              size="xs"
              disabled={busy || s === report.status}
              onClick={() => void setStatus(s)}
            >
              {STATUS_META[s].label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Triage der manuell ausgeblendeten Funde — Zähler je Grund + je Quelle zeigen, welche
 *  Datenquelle die meisten Falsch-Funde produziert (systematischer Verbesserungs-Loop). */
function HiddenFindingsTab() {
  const [data, setData] = useState<HiddenFindingsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.hiddenFindings())
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Konnte ausgeblendete Funde nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) {
    return <EmptyState icon={EyeOff} title={loading ? "Lädt…" : "Noch nichts ausgeblendet"} />
  }

  const grundEintraege = Object.entries(data.grundZaehler) as [HideReason, number][]
  const quelleEintraege = Object.entries(data.quelleZaehler).sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-neutral-600">{data.eintraege.length} ausgeblendete Funde</p>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Aktualisieren
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Nach Grund</p>
            <ul className="flex flex-col gap-1 text-sm">
              {grundEintraege.length === 0 ? (
                <li className="text-neutral-400">—</li>
              ) : (
                grundEintraege.map(([g, n]) => (
                  <li key={g} className="flex justify-between gap-3">
                    <span className="text-neutral-700">{HIDE_REASON_LABEL[g] ?? g}</span>
                    <span className="font-semibold tabular-nums text-neutral-900">{n}</span>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Nach Quelle (Falsch-Fund-Verursacher)
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {quelleEintraege.length === 0 ? (
                <li className="text-neutral-400">—</li>
              ) : (
                quelleEintraege.map(([q, n]) => (
                  <li key={q} className="flex justify-between gap-3">
                    <span className="truncate text-neutral-700">{q}</span>
                    <span className="font-semibold tabular-nums text-neutral-900">{n}</span>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {data.eintraege.length === 0 ? (
        <EmptyState icon={EyeOff} title="Noch nichts ausgeblendet" />
      ) : (
        <div className="flex flex-col gap-2">
          {data.eintraege.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <Badge variant="muted" size="sm">
                  {HIDE_REASON_LABEL[e.grund] ?? e.grund}
                </Badge>
                <span className="font-medium text-neutral-900">{e.kontext?.titel ?? e.findingKey}</span>
                {e.kontext?.quelleName ? (
                  <span className="text-xs text-neutral-500">· {e.kontext.quelleName}</span>
                ) : null}
                {e.projektName ? (
                  <span className="text-xs text-neutral-500">· Projekt: {e.projektName}</span>
                ) : null}
                {e.grundText ? (
                  <span className="w-full text-xs italic text-neutral-500">„{e.grundText}"</span>
                ) : null}
                <div className="flex-1" />
                <span
                  className="inline-flex items-center gap-1 text-xs text-neutral-400"
                  title={formatDateTimeDE(e.createdAt)}
                >
                  <Clock className="h-3.5 w-3.5" /> {formatRelativeDE(e.createdAt)}
                  {e.hiddenBy ? ` · ${e.hiddenBy}` : ""}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quellen-Vorschläge (Nutzer schlagen neue Datenquellen vor) ───────────────
function SourceRequestsTab() {
  const [requests, setRequests] = useState<SourceRequest[]>([])
  const [zaehler, setZaehler] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<Filter>("offen")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.sourceRequests.list(filter === "alle" ? undefined : filter)
      setRequests(res.requests)
      setZaehler(res.zaehler)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Konnte Vorschläge nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [filter])
  useEffect(() => {
    void load()
  }, [load])

  const gesamt = Object.values(zaehler).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = f === "alle" ? gesamt : (zaehler[f] ?? 0)
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {f === "alle" ? "Alle" : STATUS_META[f].label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-500",
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Aktualisieren
        </Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title={loading ? "Lädt…" : "Keine Vorschläge"}
          description={loading ? undefined : "In dieser Ansicht ist aktuell kein Quellen-Vorschlag."}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => (
            <SourceRequestCard key={r.id} request={r} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceRequestCard({ request, onChanged }: { request: SourceRequest; onChanged: () => void }) {
  const [editNotiz, setEditNotiz] = useState(false)
  const [notizDraft, setNotizDraft] = useState(request.notiz ?? "")
  const [busy, setBusy] = useState(false)
  const meta = STATUS_META[request.status]

  const setStatus = async (status: BugReportStatus) => {
    if (status === request.status) return
    setBusy(true)
    try {
      await api.sourceRequests.patch(request.id, { status })
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Status konnte nicht geändert werden.")
    } finally {
      setBusy(false)
    }
  }
  const saveNotiz = async () => {
    setEditNotiz(false)
    if (notizDraft === (request.notiz ?? "")) return
    try {
      await api.sourceRequests.patch(request.id, { notiz: notizDraft.trim() || null })
      toast.success("Notiz gespeichert.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Notiz konnte nicht gespeichert werden.")
    }
  }
  const remove = async () => {
    if (!window.confirm("Diesen Vorschlag wirklich löschen?")) return
    try {
      await api.sourceRequests.remove(request.id)
      toast.success("Gelöscht.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant} size="sm">
            {meta.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
            <User className="h-3.5 w-3.5 text-neutral-400" /> {request.email}
          </span>
          {request.tenantSlug ? (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Building2 className="h-3.5 w-3.5 text-neutral-400" /> {request.tenantSlug}
            </span>
          ) : null}
          <span
            className="inline-flex items-center gap-1 text-xs text-neutral-400"
            title={formatDateTimeDE(request.createdAt)}
          >
            <Clock className="h-3.5 w-3.5" /> {formatRelativeDE(request.createdAt)}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void remove()}
            aria-label="Vorschlag löschen"
            className="text-neutral-400 hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <a
          href={safeHref(request.url)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-primary-600 hover:underline"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" /> {request.url}
        </a>
        <p className="whitespace-pre-wrap text-sm text-neutral-800">{request.beschreibung}</p>

        {/* Interne Notiz */}
        <div className="border-t border-neutral-100 pt-3">
          {editNotiz ? (
            <div className="flex flex-col gap-2">
              <Textarea
                autoFocus
                rows={2}
                value={notizDraft}
                onChange={(e) => setNotizDraft(e.target.value)}
                placeholder="Interne Notiz (z.B. geprüft, Connector geplant, Ticket-Verweis) …"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditNotiz(false)}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={() => void saveNotiz()}>
                  Notiz speichern
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setNotizDraft(request.notiz ?? "")
                setEditNotiz(true)
              }}
              className="text-left text-xs text-neutral-500 hover:text-neutral-800"
            >
              {request.notiz ? (
                <span className="whitespace-pre-wrap">📝 {request.notiz}</span>
              ) : (
                <span className="italic text-neutral-400">+ Interne Notiz hinzufügen</span>
              )}
            </button>
          )}
        </div>

        {/* Status-Aktionen */}
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3">
          {(Object.keys(STATUS_META) as BugReportStatus[]).map((s) => (
            <Button
              key={s}
              variant={s === request.status ? "default" : "outline"}
              size="xs"
              disabled={busy || s === request.status}
              onClick={() => void setStatus(s)}
            >
              {STATUS_META[s].label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
