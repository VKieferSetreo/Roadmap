// Projekt-Karte für das Dashboard-Grid.

import { useNavigate } from "react-router-dom"
import { ArrowRight, MapPin, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/Badge"
import type { Project, ProjectStatus } from "@/types/domain"
import { formatRelativeDE } from "@/lib/format"
import { cn } from "@/lib/cn"

const STATUS_META: Record<ProjectStatus, { label: string; variant: "muted" | "warning" | "success" }> = {
  entwurf: { label: "Entwurf", variant: "muted" },
  analyse: { label: "Analyse läuft", variant: "warning" },
  fertig: { label: "Fertig", variant: "success" },
}

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const status = STATUS_META[project.status]
  const kritisch = project.findings.filter((f) => f.severity === "kritisch").length

  const routeLabel =
    project.route.mode === "startziel" && project.route.start
      ? `${project.route.start} → ${project.route.ziel ?? "?"}`
      : (project.route.fileName ?? "Strecke offen")

  const open = () => navigate(`/projekte/${project.id}`)

  return (
    <button
      onClick={open}
      className={cn(
        "group flex min-h-[180px] flex-col rounded-lg border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-semibold text-neutral-900">{project.name}</h3>
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{routeLabel}</span>
      </p>

      <div className="flex-1" />

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
        {project.status === "fertig" ? (
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="tabular-nums">{project.distanzKm?.toLocaleString("de-DE")} km</span>
            <span className="tabular-nums">{project.findings.length} Funde</span>
            {kritisch > 0 ? (
              <span className="flex items-center gap-1 font-medium text-red-600">
                <TriangleAlert className="h-3.5 w-3.5" /> {kritisch} kritisch
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-neutral-400">Noch keine Auswertung</span>
        )}
        <ArrowRight className="h-4 w-4 text-neutral-300 transition-colors group-hover:text-primary-600" />
      </div>

      <p className="mt-2 text-[11px] text-neutral-400">
        Aktualisiert {formatRelativeDE(project.updatedAt)}
      </p>
    </button>
  )
}
