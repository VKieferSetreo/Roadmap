// Tab 2 — Vollbild-Karte mit Route und Fund-Markern + schwebenden Overlays.

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Clock, MapPinned, Route as RouteIcon, X } from "lucide-react"
import { RouteMap } from "@/components/map/RouteMap"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import type { Project } from "@/types/domain"

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
        <div className="pointer-events-auto rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-neutral-700">
              <RouteIcon className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">{project.distanzKm?.toLocaleString("de-DE")} km</strong>
            </span>
            <span className="flex items-center gap-1.5 text-neutral-700">
              <Clock className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">
                {Math.floor((project.fahrzeitMin ?? 0) / 60)} h {(project.fahrzeitMin ?? 0) % 60} min
              </strong>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-neutral-100 pt-2">
            {counts.map(({ sev, n }) => (
              <span key={sev} className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: SEVERITY_META[sev].marker }}
                />
                {n} {SEVERITY_META[sev].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Detail des gewählten Funds unten links */}
      {selected ? (
        <div className="absolute bottom-4 left-3 z-[500] w-[320px] max-w-[calc(100%-1.5rem)]">
          <div className="rounded-lg border border-neutral-200 bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = KATEGORIE_META[selected.kategorie].icon
                  return (
                    <span
                      className="rounded-md p-1.5 text-white"
                      style={{ background: SEVERITY_META[selected.severity].marker }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  )
                })()}
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{selected.titel}</p>
                  <p className="text-xs text-neutral-500">
                    {KATEGORIE_META[selected.kategorie].label} · km {selected.km.toLocaleString("de-DE")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Schließen"
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{selected.beschreibung}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-neutral-100 pt-3 text-xs">
              {Object.entries(selected.detail).map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-neutral-400">{k}</dt>
                  <dd className="font-medium tabular-nums text-neutral-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  )
}
