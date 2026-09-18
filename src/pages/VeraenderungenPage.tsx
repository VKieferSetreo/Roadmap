// GL-Änderungstracking (nur Admin): quellenübergreifende Auswertung, wie viel sich am
// Hindernis-Bestand täglich wirklich ändert — Antwort auf den GL-Einwand "es kann nicht sein,
// dass so viele Änderungen an Baustellen/Sperrungen dazukommen". Erreichbar über /veraenderungen
// (Profil-Menü, nur Admin), NICHT in der Kunden-Sidebar — internes Auswertungswerkzeug.

import { Suspense, lazy, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, ArrowRightLeft, PlusCircle, RefreshCw, Sparkles, type LucideIcon } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { api, type VeraenderungenUebersicht } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { formatDateDE } from "@/lib/format"
import { cn } from "@/lib/cn"

const VeraenderungenZeitreihe = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenZeitreihe })),
)
const VeraenderungenProKategorie = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenProKategorie })),
)
const VeraenderungenLaufzeiten = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenLaufzeiten })),
)
const VeraenderungenVorlaufzeiten = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenVorlaufzeiten })),
)

const FENSTER = [7, 30, 90] as const

export function VeraenderungenPage() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const [tage, setTage] = useState<(typeof FENSTER)[number]>(30)

  const q = useQuery({
    queryKey: ["veraenderungen-uebersicht", tage],
    queryFn: () => api.veraenderungen.uebersicht(tage),
    enabled: live,
    staleTime: 60_000,
  })

  return (
    <PageContainer
      title="GL-Änderungstracking"
      description="Wie viel ändert sich täglich quellenübergreifend an Baustellen/Sperrungen — Art, Laufzeit, Vorlaufzeit."
      actions={
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
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} /> Aktualisieren
          </Button>
        </div>
      }
    >
      {!live ? (
        <EmptyState
          icon={Activity}
          title="Nicht verbunden"
          description="Das Änderungstracking lebt im Backend. Im Demo-Modus (ohne Server) nicht verfügbar."
        />
      ) : q.isLoading ? (
        <div className="skeleton h-64 w-full rounded-xl" />
      ) : q.isError || !q.data ? (
        <EmptyState icon={Activity} title="Nicht ladbar" description="Bitte später erneut versuchen." />
      ) : (
        <Inhalt d={q.data} />
      )}
    </PageContainer>
  )
}

function Inhalt({ d }: { d: VeraenderungenUebersicht }) {
  const kategorienLabel = d.kategorien.length <= 2 ? "Baustellen und Sperrungen" : `${d.kategorien.length} Kategorien`
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={PlusCircle} label={`Neu (${d.tage} Tage)`} value={String(d.gesamt.neu)} accent />
        <Kpi icon={Sparkles} label={`Geändert (${d.tage} Tage)`} value={String(d.gesamt.geaendert)} />
        <Kpi icon={ArrowRightLeft} label={`Weggefallen (${d.tage} Tage)`} value={String(d.gesamt.weggefallen)} />
      </div>

      <Card className="p-3 text-xs text-neutral-500">
        Fensterbasis: {kategorienLabel}. "Neu" und "Weggefallen" sind vollständige {d.tage}-Tage-Historie
        (echte Zeitstempel im Bestand). "Geändert" (inhaltliche Änderung an einer bestehenden Zeile,
        z.B. verschobenes Datum oder geänderte Breite) wird erst seit{" "}
        {d.geaendertTrackingSeit ? formatDateDE(d.geaendertTrackingSeit) : "heute"} echt erfasst — vorher
        stempelte der Import jeden Re-Import unabhängig vom Inhalt, ein Rückrechnen wäre nicht ehrlich
        gewesen. Die Kurve für "Geändert" füllt sich deshalb über die nächsten Tage.
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-neutral-800">Änderungen je Tag</p>
        <Suspense fallback={<div className="skeleton h-56 w-full rounded-lg" />}>
          <VeraenderungenZeitreihe data={d.zeitreihe} />
        </Suspense>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <p className="mb-3 text-sm font-semibold text-neutral-800">Je Kategorie</p>
          <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
            <VeraenderungenProKategorie data={d.proKategorie} />
          </Suspense>
        </Card>
        <Card className="p-4 lg:col-span-1">
          <p className="mb-1 text-sm font-semibold text-neutral-800">Laufzeit der neuen Maßnahmen</p>
          <p className="mb-2 text-xs text-neutral-400">Kurz ≤7 Tage · Mittel 8–30 Tage · Lang &gt;30 Tage / unbefristet</p>
          <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
            <VeraenderungenLaufzeiten data={d.laufzeiten} />
          </Suspense>
        </Card>
        <Card className="p-4 lg:col-span-1">
          <p className="mb-1 text-sm font-semibold text-neutral-800">Wie spontan? (Vorlaufzeit)</p>
          <p className="mb-2 text-xs text-neutral-400">Zeit zwischen Erst-Erfassung und Beginn der Maßnahme</p>
          <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
            <VeraenderungenVorlaufzeiten data={d.vorlaufzeiten} />
          </Suspense>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
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
      <div>
        <p className="text-lg font-semibold tabular-nums text-neutral-800">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </Card>
  )
}
