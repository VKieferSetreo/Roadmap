// Projekt-Detail mit 3 Reitern: Anlage · Karte · Dashboard.
// Tab steckt in der URL (/projekte/:id/:tab). Karte rendert vollflächig.

import { Navigate, useNavigate, useParams } from "react-router-dom"
import { ClipboardList, MapPinned, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Badge } from "@/components/ui/Badge"
import { useProjectStore } from "@/store/projects"
import { AnlageTab } from "@/components/project/AnlageTab"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"
import type { ProjectStatus } from "@/types/domain"

const TABS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "anlage", label: "Anlage", icon: SlidersHorizontal },
  { slug: "karte", label: "Karte", icon: MapPinned },
  { slug: "dashboard", label: "Dashboard", icon: ClipboardList },
]
const VALID = new Set(TABS.map((t) => t.slug))

const STATUS_META: Record<ProjectStatus, { label: string; variant: "muted" | "warning" | "success" }> = {
  entwurf: { label: "Entwurf", variant: "muted" },
  analyse: { label: "Analyse läuft", variant: "warning" },
  fertig: { label: "Fertig", variant: "success" },
}

export function ProjectDetail() {
  const navigate = useNavigate()
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const project = useProjectStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined))

  if (!project) return <Navigate to="/" replace />
  if (!tab || !VALID.has(tab)) return <Navigate to={`/projekte/${project.id}/anlage`} replace />

  const status = STATUS_META[project.status]

  return (
    <div className="flex h-full flex-col">
      {/* Kopfleiste */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 pt-4 lg:px-6">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">{project.name}</h1>
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
        </div>
        <Tabs value={tab} onValueChange={(v) => navigate(`/projekte/${project.id}/${v}`)} className="mt-3">
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

      {/* Reiter-Inhalt */}
      <div className="min-h-0 flex-1">
        {tab === "karte" ? (
          <KarteTab project={project} />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
            {tab === "anlage" ? <AnlageTab project={project} /> : <DashboardTab project={project} />}
          </div>
        )}
      </div>
    </div>
  )
}
