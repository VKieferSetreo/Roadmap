// Home / Dashboard — Hero mit animierten Kennzahlen + Projekt-Grid.
// Seed/Initial-Load passiert zentral im AppLayout (Datasource-Detection).

import { FolderPlus, Plus } from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useDataSourceStore } from "@/store/datasource"
import { ProjectCard } from "@/components/project/ProjectCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { AnimatedNumber } from "@/components/shared/AnimatedNumber"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"

export function DashboardHome() {
  const projects = useProjectStore((s) => s.projects)
  const loading = useProjectStore((s) => s.loading)
  const openNewProject = useUiStore((s) => s.openNewProject)
  const mode = useDataSourceStore((s) => s.mode)

  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const totalFindings = projects.reduce((s, p) => s + p.findings.length, 0)
  const totalKritisch = projects.reduce(
    (s, p) => s + p.findings.filter((f) => f.severity === "kritisch").length,
    0,
  )
  const totalKm = projects.reduce((s, p) => s + (p.distanzKm ?? 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-6 shadow-card sm:p-8">
          {/* dezentes Routen-Motiv rechts */}
          <svg
            aria-hidden
            viewBox="0 0 320 180"
            className="pointer-events-none absolute -right-6 top-0 hidden h-full w-72 text-primary-200/70 md:block"
            fill="none"
          >
            <path
              d="M18 168 C 80 120, 60 76, 140 70 S 270 40, 306 8"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="1 10"
            />
            <path
              d="M30 160 C 92 116, 76 84, 152 78 S 262 50, 298 22"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.5"
            />
            <circle cx="18" cy="168" r="6" fill="#87B52D" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="6" fill="#DC2626" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="2" fill="#fff" />
            <circle cx="140" cy="70" r="4.5" fill="#EA580C" stroke="#fff" strokeWidth="2" />
          </svg>

          <div className="relative">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                Setreo Roadmap
              </p>
              {mode === "live" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-600" />
                  </span>
                  Live-Datenbank
                </span>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.7rem]">
              Routenanalyse für Schwertransporte
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-600">
              Strecke festlegen, Transport-Stammdaten erfassen, Auswertung fahren — alle Hindernisse
              entlang der Route auf einen Blick.
            </p>

            {projects.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-primary-100 pt-5">
                <HeroStat label="Projekte" value={projects.length} />
                <HeroStat label="Funde gesamt" value={totalFindings} />
                <HeroStat label="Kritisch" value={totalKritisch} accent={totalKritisch > 0} />
                <HeroStat label="Strecke gesamt" value={totalKm} suffix=" km" />
              </div>
            ) : null}
          </div>
        </div>

        {/* Projekt-Sektion */}
        <div className="mt-8 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Ihre Projekte</h2>
            <p className="text-sm text-neutral-500">
              {projects.length} {projects.length === 1 ? "Projekt" : "Projekte"}
            </p>
          </div>
          <Button variant="outline" onClick={openNewProject}>
            <Plus className="h-4 w-4" /> Projekt hinzufügen
          </Button>
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[240px] rounded-xl border border-neutral-200/80 bg-white p-0 shadow-card"
              >
                <div className="skeleton h-24 w-full rounded-t-xl" />
                <div className="flex flex-col gap-3 p-4">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="skeleton mt-4 h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={FolderPlus}
              title="Los geht's — Ihr erstes Projekt"
              description="Legen Sie ein Projekt an, um eine Strecke zu analysieren."
              cta={<Button onClick={openNewProject}>Neues Projekt anlegen</Button>}
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HeroStat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: number
  suffix?: string
  accent?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums text-neutral-900",
          accent && "text-severity-kritisch",
        )}
      >
        <AnimatedNumber value={value} />
        {suffix ?? ""}
      </p>
    </div>
  )
}
