// Projekt-Detail mit 3 Reitern: Eingabe (Strecke + Stammdaten) · Karte · Dashboard.
// Tab steckt in der URL (/projekte/:id/:tab). Karte rendert vollflächig.
// Umbenennen/Archiv/Löschen läuft über das ⋮-Menü der Projekt-Übersicht.

import { Navigate, useNavigate, useParams } from "react-router-dom"
import { Archive, ClipboardList, MapPin, MapPinned, RotateCcw, type LucideIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Button } from "@/components/ui/Button"
import { useProjectStore } from "@/store/projects"
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

export function ProjectDetail() {
  const navigate = useNavigate()
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const project = useProjectStore((s) => (id ? (s.projects ?? []).find((p) => p.id === id) : undefined))
  const loading = useProjectStore((s) => s.loading)
  const seeded = useProjectStore((s) => s.seeded)
  const archiveProject = useProjectStore((s) => s.archiveProject)

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
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
            {project.name}
          </h1>
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => navigate(`/projekte/${project.id}/${v}`)}
          className="mt-2"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.slug} value={t.slug}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* T-236: archiviertes Projekt sichtbar kennzeichnen (war per Deep-Link still editierbar) +
          Ein-Klick-Wiederherstellen. Macht das Archivieren semantisch wieder belastbar. */}
      {project.archiviertAm ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 lg:px-6">
          <Archive className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Dieses Projekt ist <strong>archiviert</strong>. Änderungen sind nicht vorgesehen. Zum Bearbeiten wiederherstellen.
          </span>
          <Button size="sm" variant="outline" onClick={() => archiveProject(project.id, false)}>
            <RotateCcw className="h-3.5 w-3.5" /> Wiederherstellen
          </Button>
        </div>
      ) : null}

      {/* Reiter-Inhalt */}
      <div className="min-h-0 flex-1">
        {tab === "karte" ? (
          <KarteTab project={project} canHide />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
            {tab === "route" ? (
              // Eingabe: Streckenanlage + Transport-Stammdaten/Zeitraum/Veröffentlichung auf einer Seite.
              <div className="flex flex-col gap-5">
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
