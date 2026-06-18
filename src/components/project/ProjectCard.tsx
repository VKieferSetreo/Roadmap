// Projekt-Darstellung fürs Dashboard: Karten-Kachel (echte Karten-Vorschau mit
// Strecken) und kompakte Listen-Zeile — umschaltbar über den Ansicht-Toggle.

import { useNavigate } from "react-router-dom"
import { ArrowRight, Route as RouteIcon, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/Badge"
import { MapPreview } from "@/components/shared/MapPreview"
import { ProjectMenu } from "./ProjectMenu"
import { CreatorAvatar } from "./CreatorAvatar"
import { visibleFindings } from "./findingMeta"
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

/** Strecken-Beschriftung: immer die Anzahl ("1 Strecke", "2 Strecken") — nicht den Dateinamen. */
function routeLabel(project: Project): string {
  const n = project.routes.filter((r) => r.points.length >= 2).length
  if (n === 0) return "Noch keine Strecke"
  return `${n} Strecke${n === 1 ? "" : "n"}`
}

export function ProjectCard({ project, index = 0 }: { project: Project; index?: number }) {
  const navigate = useNavigate()
  const status = STATUS_META[project.status]
  const sichtbar = visibleFindings(project.findings)
  const kritisch = sichtbar.filter((f) => f.severity === "kritisch").length
  const hasRoute = project.routes.some((r) => r.points.length >= 2)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/projekte/${project.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          navigate(`/projekte/${project.id}`)
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-neutral-200/80 bg-white text-left shadow-card",
        "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-card-hover",
        "animate-rise-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Karten-Vorschau mit geografischer Einordnung */}
      <div className="relative h-28 w-full shrink-0 border-b border-neutral-100 bg-neutral-50">
        {hasRoute ? (
          <MapPreview routes={project.routes} findings={sichtbar} />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-neutral-300">
            <RouteIcon className="h-5 w-5" />
            <span className="text-xs font-medium">Noch keine Strecke</span>
          </div>
        )}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
          <span className="rounded-md bg-white/85 backdrop-blur-sm">
            <ProjectMenu project={project} />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          {project.erstelltVon ? <CreatorAvatar email={project.erstelltVon} size={22} /> : null}
          <h3 className="line-clamp-2 font-semibold leading-snug text-neutral-900">{project.name}</h3>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
          <RouteIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{routeLabel(project)}</span>
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          {project.status === "fertig" ? (
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <span className="tabular-nums">{project.distanzKm?.toLocaleString("de-DE")} km</span>
              <span className="tabular-nums">{sichtbar.length} Funde</span>
              {kritisch > 0 ? (
                <span className="flex items-center gap-1 font-medium text-severity-kritisch">
                  <TriangleAlert className="h-3.5 w-3.5" /> {kritisch} kritisch
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-neutral-500">Noch keine Auswertung</span>
          )}
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600" />
        </div>

        <p className="mt-2 text-[11px] text-neutral-500">
          Aktualisiert {formatRelativeDE(project.updatedAt)}
        </p>
      </div>
    </div>
  )
}

/** Kompakte Listen-Zeile (Ansicht „Liste" — ohne Karten-Vorschau). */
export function ProjectListRow({ project, index = 0 }: { project: Project; index?: number }) {
  const navigate = useNavigate()
  const status = STATUS_META[project.status]
  const sichtbar = visibleFindings(project.findings)
  const kritisch = sichtbar.filter((f) => f.severity === "kritisch").length

  return (
    <li className="animate-rise-in" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/projekte/${project.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(`/projekte/${project.id}`)
        }}
        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
      >
        {project.erstelltVon ? <CreatorAvatar email={project.erstelltVon} size={24} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">{project.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {routeLabel(project)} · aktualisiert {formatRelativeDE(project.updatedAt)}
          </p>
        </div>
        {project.status === "fertig" ? (
          <div className="hidden items-center gap-3 text-xs text-neutral-600 sm:flex">
            <span className="tabular-nums">{project.distanzKm?.toLocaleString("de-DE")} km</span>
            <span className="tabular-nums">{sichtbar.length} Funde</span>
            {kritisch > 0 ? (
              <span className="flex items-center gap-1 font-medium text-severity-kritisch">
                <TriangleAlert className="h-3.5 w-3.5" /> {kritisch}
              </span>
            ) : null}
          </div>
        ) : null}
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
        <ProjectMenu project={project} />
        <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600" />
      </div>
    </li>
  )
}
