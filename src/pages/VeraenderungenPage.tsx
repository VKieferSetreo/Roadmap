// Änderungsverfolgung: quellenübergreifende Auswertung, wie viel sich am Hindernis-Bestand
// täglich wirklich ändert. Erreichbar über /veraenderungen (Profil-Menü). Seit 2026-09-20
// für ALLE angemeldeten Nutzer offen, nicht mehr nur Admin.
//
// Layout bewusst mit einer berechneten Kennzahl vorne (Ø Ereignisse/Tag + Spontan-Anteil),
// erst danach die Belege als Charts — analytisch, keine Bewertung im Text.

import { Suspense, lazy, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, CalendarX2, Gauge, PlusCircle, Sparkles, XCircle, Zap, type LucideIcon,
} from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { EmptyState } from "@/components/shared/EmptyState"
import { api, type VeraenderungenUebersicht } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"
import { VeraenderungenFreigaben } from "@/components/veraenderungen/VeraenderungenFreigaben"
import { AenderungsBelege } from "@/components/veraenderungen/AenderungsBelege"
import { cn } from "@/lib/cn"
import { AMPEL } from "@/lib/ampel"

const VeraenderungenZeitreihe = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenZeitreihe })),
)
const VeraenderungenProKategorie = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenProKategorie })),
)
const VeraenderungenProStrassenklasse = lazy(() =>
  import("@/components/charts/VeraenderungenCharts").then((m) => ({ default: m.VeraenderungenProStrassenklasse })),
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
      title="Änderungsverfolgung"
      description="Wie viel ändert sich täglich quellenübergreifend an Baustellen und Sperrungen: Art, Laufzeit, Vorlaufzeit."
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
        <div className="skeleton h-64 w-full rounded-2xl" />
      ) : q.isError || !q.data ? (
        <EmptyState icon={Activity} title="Nicht ladbar" description="Bitte später erneut versuchen." />
      ) : (
        <Inhalt d={q.data} />
      )}
    </PageContainer>
  )
}

/** Der komplette Seiteninhalt unter dem Kopf. Wird AUCH von der oeffentlichen
 *  Freigabe-Ansicht gerendert (src/freigabe/main.tsx), damit aussen und innen nicht
 *  auseinanderlaufen koennen — es ist derselbe Code, kein Nachbau. Was hier geaendert
 *  wird, aendert sich in beiden Ansichten. */
export function Inhalt({ d }: { d: VeraenderungenUebersicht }) {
  const isAdmin = useContextStore((s) => s.isAdmin)
  const insight = useMemo(() => computeInsight(d), [d])

  return (
    <div className="flex flex-col gap-5">
      <Hero d={d} insight={insight} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Dieselbe Ampel wie in den Diagrammen: eine Kategorie hat EINE Farbe auf der Seite,
            sonst ist "Neu" oben grün und im Balken darunter rot. */}
        <Kpi icon={PlusCircle} label="Neu" value={d.gesamt.neu} akzent={AMPEL.rot} />
        <Kpi icon={Sparkles} label="Geändert" value={d.gesamt.geaendert} akzent={AMPEL.orange} />
        <Kpi icon={CalendarX2} label="Ausgelaufen" value={d.gesamt.ausgelaufen} akzent={AMPEL.gelb} />
        <Kpi icon={XCircle} label="Entfernt" value={d.gesamt.entfernt} akzent={AMPEL.gruen} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Änderungen je Tag</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <Suspense fallback={<div className="skeleton h-56 w-full rounded-lg" />}>
            <VeraenderungenZeitreihe data={d.zeitreihe} vollstaendigAb={d.erfassungVollstaendigAb} />
          </Suspense>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Je Kategorie</CardTitle></CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenProKategorie data={d.proKategorie} />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Je Straßenklasse</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenProStrassenklasse data={d.proStrassenklasse} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Laufzeit</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenLaufzeiten data={d.laufzeiten} />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="border-primary-200/70">
          <CardHeader>
            <CardTitle className="text-sm">Vorlaufzeit</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenVorlaufzeiten data={d.vorlaufzeiten} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <AenderungsBelege belege={d.belege} />

      {/* Nur Admin: die Auswertung selbst steht jedem Angemeldeten offen, sie nach AUSSEN
          freizugeben ist eine andere Entscheidung. */}
      {isAdmin ? <VeraenderungenFreigaben /> : null}

    </div>
  )
}

/** Die EINE Kernzahl fürs Boardroom-Publikum: Ø Ereignisse/Tag + Spontan-Anteil unter den
 *  neuen Maßnahmen (nur die messbaren, "unbekannt" fließt nicht in den Anteil ein — ehrlicher
 *  als es über den vollen Nenner zu glätten). */
function computeInsight(d: VeraenderungenUebersicht) {
  const proTag = d.tage > 0
    ? (d.gesamt.neu + d.gesamt.geaendert + d.gesamt.ausgelaufen + d.gesamt.entfernt) / d.tage
    : 0
  const v = d.vorlaufzeiten
  const messbar = (v.spontan ?? 0) + (v.kurzfristig ?? 0) + (v.geplant ?? 0) + (v.langfristig ?? 0)
  const spontanAnteil = messbar > 0 ? ((v.spontan ?? 0) + (v.kurzfristig ?? 0)) / messbar : null
  return { proTag, spontanAnteil }
}

function Hero({ d, insight }: { d: VeraenderungenUebersicht; insight: ReturnType<typeof computeInsight> }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-6 shadow-card sm:p-8">
      <svg aria-hidden viewBox="0 0 320 180" className="pointer-events-none absolute -right-6 top-0 hidden h-full w-72 text-primary-200/60 md:block" fill="none">
        <path d="M18 168 C 80 120, 60 76, 140 70 S 270 40, 306 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="1 10" />
        <path d="M30 160 C 92 116, 76 84, 152 78 S 262 50, 298 22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
        <circle cx="18" cy="168" r="6" fill="#87B52D" stroke="#fff" strokeWidth="2.5" />
        <circle cx="306" cy="8" r="6" fill="#EB6834" stroke="#fff" strokeWidth="2.5" />
      </svg>
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-600">
            <Gauge className="h-3.5 w-3.5" /> Änderungsverfolgung · letzte {d.tage} Tage
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.7rem]">
            Neue, geänderte und weggefallene Hindernisse
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-600">
            Grundlage sind{" "}
            {d.quellenBasis ? (
              <strong className="font-semibold text-neutral-800">{d.quellenBasis.quellen}</strong>
            ) : null}{" "}
            bundesweit angebundene Quellen: Autobahn GmbH, Landesbetriebe, Städte und Kommunen.
          </p>
        </div>
        <div className="flex shrink-0 gap-6">
          <HeroStat
            value={insight.proTag.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
            label="Ereignisse pro Tag"
          />
          {insight.spontanAnteil != null ? (
            <HeroStat
              value={`${Math.round(insight.spontanAnteil * 100)}%`}
              label="mit ≤6 Tagen Vorlauf"
              icon={Zap}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function HeroStat({ value, label, icon: Icon }: { value: string; label: string; icon?: LucideIcon }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5 text-3xl font-bold tabular-nums tracking-tight text-primary-700 sm:text-4xl">
        {Icon ? <Icon className="h-6 w-6 text-primary-500" /> : null}
        {value}
      </div>
      <p className="mt-0.5 text-xs font-medium text-neutral-600">{label}</p>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, akzent }: { icon: LucideIcon; label: string; value: number; akzent: string }) {
  return (
    <Card className="relative overflow-hidden p-4 pl-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: akzent }} aria-hidden />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${akzent}1a`, color: akzent }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900">{value.toLocaleString("de-DE")}</p>
          <p className="text-xs font-medium text-neutral-600">{label}</p>
        </div>
      </div>
    </Card>
  )
}
