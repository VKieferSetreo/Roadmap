// Projekt-Detail mit 3 Reitern: Eingabe (Strecke + Stammdaten) · Karte · Dashboard.
// Tab steckt in der URL (/projekte/:id/:tab). Karte rendert vollflächig.
// Umbenennen/Archiv/Löschen läuft über das ⋮-Menü der Projekt-Übersicht.

import { Navigate, useNavigate, useParams } from "react-router-dom"
import {
  ClipboardList,
  MapPin,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { RouteTab } from "@/components/project/RouteTab"
import { AnlageTab } from "@/components/project/AnlageTab"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"

const TABS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "route", label: "Eingabe", icon: MapPin },
  { slug: "karte", label: "Karte", icon: MapPinned },
  { slug: "dashboard", label: "Dashboard", icon: ClipboardList },
]
const VALID = new Set(TABS.map((t) => t.slug))

// Sidebar-Ein-/Ausklapp-Toggle als Overlay-Chip — sitzt im Karten-Overlay gap-2
// unter dem "Strecken"-Kasten (gleicher Glas-Look wie die Karten darüber).
function SidebarToggleChip() {
  const open = useUiStore((s) => s.sidebarOpen)
  const toggle = useUiStore((s) => s.toggleSidebar)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "Navigation einklappen" : "Navigation ausklappen"}
      aria-expanded={open}
      className="glass pointer-events-auto inline-flex animate-rise-in items-center gap-2 self-start px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:text-primary-600"
      style={{ animationDelay: "120ms" }}
    >
      {open ? (
        <PanelLeftClose className="h-4 w-4 text-primary-600" />
      ) : (
        <PanelLeftOpen className="h-4 w-4 text-primary-600" />
      )}
      <span>{open ? "Menü einklappen" : "Menü ausklappen"}</span>
    </button>
  )
}

export function ProjectDetail() {
  const navigate = useNavigate()
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const project = useProjectStore((s) => (id ? (s.projects ?? []).find((p) => p.id === id) : undefined))
  const loading = useProjectStore((s) => s.loading)
  const seeded = useProjectStore((s) => s.seeded)

  // Deep-Link während des Initial-Loads: warten statt nach Home umleiten.
  if (!project && (loading || !seeded)) {
    return (
      <div className="flex h-full flex-col gap-4 px-4 py-6 lg:px-6">
        <div className="skeleton h-7 w-72 rounded" />
        <div className="skeleton h-9 w-96 rounded" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (!project) return <Navigate to="/" replace />
  if (!tab || !VALID.has(tab)) return <Navigate to={`/projekte/${project.id}/route`} replace />

  return (
    <div className="flex h-full flex-col">
      {/* Kopfleiste */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 pt-4 lg:px-6">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
            {project.name}
          </h1>
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => navigate(`/projekte/${project.id}/${v}`)}
          className="mt-3"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.slug} value={t.slug}>
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.slug === "dashboard" && project.findings.length > 0 ? (
                  <span className="ml-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-600">
                    {project.findings.length}
                  </span>
                ) : null}
                {t.slug === "route" && project.routes.length > 0 ? (
                  <span className="ml-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-600">
                    {project.routes.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Reiter-Inhalt */}
      <div className="min-h-0 flex-1">
        {tab === "karte" ? (
          <KarteTab project={project} overlayFooter={<SidebarToggleChip />} />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
            {tab === "route" ? (
              // Eingabe: Streckenanlage + Transport-Stammdaten/Zeitraum/Veröffentlichung auf einer Seite.
              <div className="flex flex-col gap-8">
                <RouteTab project={project} />
                <AnlageTab project={project} />
              </div>
            ) : (
              <DashboardTab project={project} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
