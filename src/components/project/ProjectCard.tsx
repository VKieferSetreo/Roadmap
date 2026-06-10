// Projekt-Karte fürs Dashboard-Grid: Mini-Streckenvorschau + Status + Kennzahlen.

import { useNavigate } from "react-router-dom"
import { ArrowRight, MapPin, Route as RouteIcon, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/Badge"
import { RoutePreview } from "@/components/shared/RoutePreview"
import type { Project, ProjectStatus } from "@/types/domain"
import { formatRelativeDE } from "@/lib/format"
import { cn } from "@/lib/cn"

const STATUS_META: Record<
  ProjectStatus,
  { label: string; variant: "muted" | "warning" | "success" }
> = {
  entwurf: { label: "Entwurf", variant: "muted" },
  analyse: { label: "Analyse läuft", variant: "warning" },
  fertig: { label: "Fertig", variant: "success" },
}

export function ProjectCard({ project, index = 0 }: { project: Project; index?: number }) {
  const navigate = useNavigate()
  const status = STATUS_META[project.status]
  const kritisch = project.findings.filter((f) => f.severity === "kritisch").length
  const hasRoute = project.routeGeometry.length >= 2

  const routeLabel =
    project.route.mode === "startziel" && project.route.start
      ? `${project.route.start} → ${project.route.ziel ?? "?"}`
      : (project.route.fileName ?? "Strecke offen")

  const open = () => navigate(`/projekte/${project.id}`)

  return (
    <button
      onClick={open}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-neutral-200/80 bg-white text-left shadow-card",
        "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-card-hover",
        "animate-rise-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Strecken-Vorschau */}
      <div className="relative h-24 w-full shrink-0 border-b border-neutral-100 bg-gradient-to-br from-primary-50/70 via-neutral-50 to-white">
        {hasRoute ? (
          <RoutePreview
            geometry={project.routeGeometry}
            findings={project.findings}
            className="p-1"
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-neutral-300">
            <RouteIcon className="h-5 w-5" />
            <span className="text-xs font-medium">Noch keine Strecke</span>
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug text-neutral-900">{project.name}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{routeLabel}</span>
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          {project.status === "fertig" ? (
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <span className="tabular-nums">{project.distanzKm?.toLocaleString("de-DE")} km</span>
              <span className="tabular-nums">{project.findings.length} Funde</span>
              {kritisch > 0 ? (
                <span className="flex items-center gap-1 font-medium text-severity-kritisch">
                  <TriangleAlert className="h-3.5 w-3.5" /> {kritisch} kritisch
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-neutral-400">Noch keine Auswertung</span>
          )}
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600" />
        </div>

        <p className="mt-2 text-[11px] text-neutral-400">
          Aktualisiert {formatRelativeDE(project.updatedAt)}
        </p>
      </div>
    </button>
  )
}
