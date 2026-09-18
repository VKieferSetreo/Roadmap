// Änderungsverfolgung (nur Admin): quellenübergreifende Auswertung, wie viel sich am
// Hindernis-Bestand täglich wirklich ändert. Erreichbar über /veraenderungen (Profil-Menü,
// nur Admin), NICHT in der Kunden-Sidebar — internes Auswertungswerkzeug.
//
// Layout bewusst mit einer berechneten Kennzahl vorne (Ø Ereignisse/Tag + Spontan-Anteil),
// erst danach die Belege als Charts — analytisch, keine Bewertung im Text.

import { Suspense, lazy, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, ArrowRightLeft, Gauge, PlusCircle, RefreshCw, Sparkles, Zap, type LucideIcon,
} from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
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
      title="Änderungsverfolgung"
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
        <div className="skeleton h-64 w-full rounded-2xl" />
      ) : q.isError || !q.data ? (
        <EmptyState icon={Activity} title="Nicht ladbar" description="Bitte später erneut versuchen." />
      ) : (
        <Inhalt d={q.data} />
      )}
    </PageContainer>
  )
}

function Inhalt({ d }: { d: VeraenderungenUebersicht }) {
  const insight = useMemo(() => computeInsight(d), [d])

  return (
    <div className="flex flex-col gap-5">
      <Hero d={d} insight={insight} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon={PlusCircle} label="Neu" sub={`${d.tage} Tage`} value={d.gesamt.neu} akzent="#1baf7a" />
        <Kpi icon={Sparkles} label="Geändert" sub={geaendertSub(d)} value={d.gesamt.geaendert} akzent="#eb6834" />
        <Kpi icon={ArrowRightLeft} label="Weggefallen" sub={`${d.tage} Tage`} value={d.gesamt.weggefallen} akzent="#2a78d6" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Änderungen je Tag</CardTitle>
          <span className="text-xs text-neutral-400">{d.kategorien.length <= 2 ? "Baustellen und Sperrungen" : `${d.kategorien.length} Kategorien`}</span>
        </CardHeader>
        <CardContent className="pt-2">
          <Suspense fallback={<div className="skeleton h-56 w-full rounded-lg" />}>
            <VeraenderungenZeitreihe data={d.zeitreihe} />
          </Suspense>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-sm">Je Kategorie</CardTitle></CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenProKategorie data={d.proKategorie} />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Laufzeit</CardTitle>
            <p className="text-xs text-neutral-400">Neue Maßnahmen · Kurz ≤7 Tage · Mittel 8–30 Tage · Lang &gt;30 Tage / unbefristet</p>
          </CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenLaufzeiten data={d.laufzeiten} />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 border-primary-200/70">
          <CardHeader>
            <CardTitle className="text-sm">Vorlaufzeit</CardTitle>
            <p className="text-xs text-neutral-400">Neue Maßnahmen · Zeit zwischen Erst-Erfassung und Beginn</p>
          </CardHeader>
          <CardContent className="pt-2">
            <Suspense fallback={<div className="skeleton h-44 w-full rounded-lg" />}>
              <VeraenderungenVorlaufzeiten data={d.vorlaufzeiten} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Herleitung, ungeschönt</p>
        <p className="text-xs leading-relaxed text-neutral-500">
          Rohzahl vor Bereinigung: {d.roh.neu.toLocaleString("de-DE")} Neu, {d.roh.weggefallen.toLocaleString("de-DE")} Weggefallen.
          Davon {d.roh.erstbefuellungNeuerQuellen.toLocaleString("de-DE")} als Erstbefüllung neu angebundener Quellen
          und {(d.roh.neu - d.roh.erstbefuellungNeuerQuellen - d.gesamt.neu).toLocaleString("de-DE")} als
          Quellen-Rotation (dieselbe Stelle, neue ID innerhalb von 45 Tagen am gleichen Ort) erkannt und
          nicht mitgezählt — bleiben {d.gesamt.neu.toLocaleString("de-DE")} echte "Neu" und {d.gesamt.weggefallen.toLocaleString("de-DE")} echte "Weggefallen".
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          "Neu" und "Weggefallen" sind vollständige {d.tage}-Tage-Historie (echte Zeitstempel im
          Bestand). "Geändert" (inhaltliche Änderung an einer bestehenden Zeile, z.B. verschobenes
          Datum oder geänderte Breite) wird erst seit{" "}
          {d.geaendertTrackingSeit ? formatDateDE(d.geaendertTrackingSeit) : "heute"} echt erfasst —
          die Kurve dafür füllt sich über die nächsten Tage.
        </p>
      </Card>
    </div>
  )
}

/** Die EINE Kernzahl fürs Boardroom-Publikum: Ø Ereignisse/Tag + Spontan-Anteil unter den
 *  neuen Maßnahmen (nur die messbaren, "unbekannt" fließt nicht in den Anteil ein — ehrlicher
 *  als es über den vollen Nenner zu glätten). */
function computeInsight(d: VeraenderungenUebersicht) {
  const proTag = d.tage > 0 ? (d.gesamt.neu + d.gesamt.geaendert + d.gesamt.weggefallen) / d.tage : 0
  const v = d.vorlaufzeiten
  const messbar = (v.spontan ?? 0) + (v.kurzfristig ?? 0) + (v.geplant ?? 0) + (v.langfristig ?? 0)
  const spontanAnteil = messbar > 0 ? ((v.spontan ?? 0) + (v.kurzfristig ?? 0)) / messbar : null
  return { proTag, spontanAnteil, messbar }
}

function geaendertSub(d: VeraenderungenUebersicht) {
  if (!d.geaendertTrackingSeit) return "ab heute"
  return `seit ${formatDateDE(d.geaendertTrackingSeit)}`
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
            Quellenübergreifend erfasst, je Ereignis mit Kategorie, Laufzeit und Vorlaufzeit.
            Quellen-Rotation (dieselbe Stelle unter neuer ID) und Erstbefüllung neu angebundener
            Quellen sind herausgerechnet — Beleg unten.
          </p>
        </div>
        <div className="flex shrink-0 gap-6">
          <HeroStat
            value={insight.proTag.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
            label="Ereignisse pro Tag"
            hint="Ø neu + geändert + weggefallen"
          />
          {insight.spontanAnteil != null ? (
            <HeroStat
              value={`${Math.round(insight.spontanAnteil * 100)}%`}
              label="mit ≤6 Tagen Vorlauf"
              hint={`von ${insight.messbar} datierten neuen Maßnahmen`}
              icon={Zap}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function HeroStat({ value, label, hint, icon: Icon }: { value: string; label: string; hint: string; icon?: LucideIcon }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5 text-3xl font-bold tabular-nums tracking-tight text-primary-700 sm:text-4xl">
        {Icon ? <Icon className="h-6 w-6 text-primary-500" /> : null}
        {value}
      </div>
      <p className="mt-0.5 text-xs font-medium text-neutral-600">{label}</p>
      <p className="text-[11px] text-neutral-400">{hint}</p>
    </div>
  )
}

function Kpi({ icon: Icon, label, sub, value, akzent }: { icon: LucideIcon; label: string; sub: string; value: number; akzent: string }) {
  return (
    <Card className="relative overflow-hidden p-4 pl-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: akzent }} aria-hidden />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${akzent}1a`, color: akzent }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900">{value.toLocaleString("de-DE")}</p>
          <p className="text-xs font-medium text-neutral-600">{label} <span className="text-neutral-400">· {sub}</span></p>
        </div>
      </div>
    </Card>
  )
}
