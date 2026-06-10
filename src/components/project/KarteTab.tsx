// Tab 2 — Vollbild-Karte mit Route und Fund-Markern + Glass-Overlays
// (Routen-Kennzahlen, Severity-Legende, Fund-Detail mit Quelle).

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Building2,
  ClipboardList,
  Clock,
  ExternalLink,
  MapPinned,
  Route as RouteIcon,
  X,
} from "lucide-react"
import { RouteMap } from "@/components/map/RouteMap"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { KategorieGlyph } from "./KategorieGlyph"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import type { Project } from "@/types/domain"
import { cn } from "@/lib/cn"

export function KarteTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (project.status !== "fertig" || project.routeGeometry.length < 2) {
    return (
      <div className="mx-auto flex h-full max-w-2xl items-center px-4 py-10">
        <EmptyState
          icon={MapPinned}
          title="Noch keine Auswertung"
          description="Lege die Strecke fest und starte die Auswertung — die Funde erscheinen dann hier auf der Karte."
          cta={
            <Button onClick={() => navigate(`/projekte/${project.id}/anlage`)}>Zur Anlage</Button>
          }
        />
      </div>
    )
  }

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: project.findings.filter((f) => f.severity === sev).length,
  }))
  // Unique Kategorien auf der Strecke — für die Legende (alphabetisch nach Label).
  const kategoriesOnRoute = Array.from(new Set(project.findings.map((f) => f.kategorie))).sort(
    (a, b) => KATEGORIE_META[a].label.localeCompare(KATEGORIE_META[b].label),
  )
  const selected = project.findings.find((f) => f.id === selectedId)

  return (
    <div className="relative h-full w-full">
      <RouteMap
        geometry={project.routeGeometry}
        findings={project.findings}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Routen-Übersicht oben links */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-2">
        <div className="glass pointer-events-auto animate-rise-in p-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-neutral-700">
              <RouteIcon className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">
                {project.distanzKm?.toLocaleString("de-DE")} km
              </strong>
            </span>
            <span className="flex items-center gap-1.5 text-neutral-700">
              <Clock className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">
                {Math.floor((project.fahrzeitMin ?? 0) / 60)} h {(project.fahrzeitMin ?? 0) % 60}{" "}
                min
              </strong>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-neutral-200/70 pt-2">
            {counts.map(({ sev, n }) => (
              <span
                key={sev}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  n > 0
                    ? SEVERITY_META[sev].soft
                    : "border-neutral-200 bg-neutral-50 text-neutral-400",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    n > 0 ? SEVERITY_META[sev].dot : "bg-neutral-300",
                  )}
                />
                {n} {SEVERITY_META[sev].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legende oben rechts: Kategorien, die auf der Strecke gefunden wurden */}
      {kategoriesOnRoute.length > 0 ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[500] hidden sm:block">
          <div
            className="glass pointer-events-auto min-w-[190px] animate-rise-in px-3 py-2.5"
            style={{ animationDelay: "80ms" }}
          >
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              Legende
            </p>
            <ul className="flex flex-col gap-1.5">
              {kategoriesOnRoute.map((kat) => {
                const count = project.findings.filter((f) => f.kategorie === kat).length
                return (
                  <li key={kat} className="flex items-center gap-2 text-xs text-neutral-700">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-100 text-neutral-700">
                      <KategorieGlyph kategorie={kat} className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{KATEGORIE_META[kat].label}</span>
                    <span className="tabular-nums text-neutral-400">{count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Detail des gewählten Funds unten links */}
      {selected ? (
        <div
          key={selected.id}
          className="absolute bottom-4 left-3 z-[500] w-[340px] max-w-[calc(100%-1.5rem)]"
        >
          <div className="glass animate-rise-in overflow-hidden">
            {/* Severity-Akzent oben */}
            <div className={cn("h-1 w-full", SEVERITY_META[selected.severity].dot)} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={cn("rounded-lg p-2", SEVERITY_META[selected.severity].chip)}>
                    <KategorieGlyph kategorie={selected.kategorie} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{selected.titel}</p>
                    <p className="text-xs text-neutral-500">
                      {KATEGORIE_META[selected.kategorie].label} · km{" "}
                      {selected.km.toLocaleString("de-DE")}
                      {selected.strassenRef ? ` · ${selected.strassenRef}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Schließen"
                  className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{selected.beschreibung}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-neutral-200/70 pt-3 text-xs">
                {Object.entries(selected.detail).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <dt className="text-neutral-400">{k}</dt>
                    <dd className="font-medium tabular-nums text-neutral-800">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.zustaendig ? (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-500">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  {selected.zustaendig}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3">
                <button
                  onClick={() => navigate(`/projekte/${project.id}/dashboard`)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  <ClipboardList className="h-3.5 w-3.5" /> Im Dashboard öffnen
                </button>
                {selected.quelle ? (
                  <a
                    href={selected.quelle.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
                  >
                    {selected.quelle.name} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
