// Analytics-Tab (nur Admin: mxk/vki) — Plattform-Nutzung im Überblick:
// wer ist jetzt online, wie viele Nutzer/Sessions, manuelle Auswertungen, aktive
// Verweildauer je Nutzer. Daten aus /api/analytics/overview (30-s-Poll).

import { Suspense, lazy } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, Clock, PlayCircle, RefreshCw, Users, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { api } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { formatRelativeDE } from "@/lib/format"
import { cn } from "@/lib/cn"

// Charts lazy (recharts als eigener Chunk, wie SeverityDonut/KategorieBar).
const AktiveNutzerProTag = lazy(() =>
  import("@/components/charts/AnalyticsCharts").then((m) => ({ default: m.AktiveNutzerProTag })),
)
const NutzungJeNutzer = lazy(() =>
  import("@/components/charts/AnalyticsCharts").then((m) => ({ default: m.NutzungJeNutzer })),
)

function fmtDauer(min: number): string {
  if (!min || min < 1) return "< 1 min"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function AnalyticsBoard() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const q = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => api.analytics.overview(),
    enabled: live,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  if (!live) {
    return (
      <EmptyState
        icon={Activity}
        title="Analytics nicht verbunden"
        description="Die Plattform-Statistik lebt im Backend. Im Demo-Modus (ohne Server) nicht verfügbar."
      />
    )
  }
  if (q.isLoading) return <div className="skeleton h-64 w-full rounded-xl" />
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon={Activity}
        title="Statistik nicht ladbar"
        description="Die Analytics-Daten sind gerade nicht erreichbar. Bitte später erneut versuchen."
      />
    )
  }

  const d = q.data
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Plattform-Nutzung — wer ist online, wie viel wird genutzt.</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} /> Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={Activity} label="Jetzt online" value={String(d.onlineJetzt)} accent />
        <Kpi icon={Users} label="Nutzer gesamt" value={String(d.totals.nutzer)} />
        <Kpi icon={PlayCircle} label="Manuelle Auswertungen" value={String(d.totals.manuelleAuswertungen)} />
        <Kpi icon={Clock} label="Aktive Zeit gesamt" value={fmtDauer(d.totals.aktivMinGesamt)} />
      </div>

      {d.online.length > 0 ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-neutral-800">Jetzt online ({d.online.length})</p>
          <div className="flex flex-wrap gap-2">
            {d.online.map((o) => (
              <span
                key={o.email}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700"
              >
                <span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden /> {o.email}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-neutral-800">Aktive Nutzer je Tag (14 Tage)</p>
          <Suspense fallback={<div className="skeleton h-56 w-full rounded-lg" />}>
            <AktiveNutzerProTag data={d.proTag} />
          </Suspense>
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-neutral-800">Nutzung je Nutzer (aktive Zeit)</p>
          <Suspense fallback={<div className="skeleton h-56 w-full rounded-lg" />}>
            <NutzungJeNutzer data={d.proNutzer} />
          </Suspense>
        </Card>
      </div>

      <Card>
        <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-800">
          Nutzung je Nutzer
        </div>
        {d.proNutzer.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">Noch keine Aktivität erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-2 font-medium">Nutzer</th>
                  <th className="px-4 py-2 text-right font-medium">Sessions</th>
                  <th className="px-4 py-2 text-right font-medium">Aktive Zeit</th>
                  <th className="px-4 py-2 text-right font-medium">Auswertungen</th>
                  <th className="px-4 py-2 text-right font-medium">Letzter Besuch</th>
                </tr>
              </thead>
              <tbody>
                {d.proNutzer.map((u) => (
                  <tr key={u.email} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-2 font-medium text-neutral-800">{u.email}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{u.sessions}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{fmtDauer(u.aktivMin)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{u.manuelleAuswertungen}</td>
                    <td className="px-4 py-2 text-right text-neutral-500">{formatRelativeDE(u.letzterBesuch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {d.letzteSessions.length > 0 ? (
        <Card>
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-800">
            Letzte Sitzungen
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-2 font-medium">Nutzer</th>
                  <th className="px-4 py-2 font-medium">Beginn</th>
                  <th className="px-4 py-2 text-right font-medium">Dauer</th>
                  <th className="px-4 py-2 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {d.letzteSessions.map((s, i) => (
                  <tr key={i} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-2 text-neutral-800">{s.email}</td>
                    <td className="px-4 py-2 text-neutral-500">{formatRelativeDE(s.startedAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{fmtDauer(s.dauerMin)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{s.hits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <Card className={cn("flex items-center gap-3 p-4", accent && "border-primary-200 bg-primary-50/40")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-500",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-neutral-500">{label}</p>
        <p className="text-lg font-bold tabular-nums text-neutral-900">{value}</p>
      </div>
    </Card>
  )
}
