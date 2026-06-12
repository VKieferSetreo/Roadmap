// Tab 2 — Vollbild-Karte mit allen Strecken (farblich getrennt) + Fund-Markern.
// Ebenen-Panel (aufklappbar, Checkboxen) blendet Strecken samt ihrer Funde ein/aus.

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  MapPinned,
  MapPinPlus,
  Route as RouteIcon,
  X,
} from "lucide-react"
import { RouteMap } from "@/components/map/RouteMap"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { KategorieGlyph } from "./KategorieGlyph"
import { ObstacleDialog } from "./ObstacleDialog"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { useDataSourceStore } from "@/store/datasource"
import { useProjectStore } from "@/store/projects"
import type { Project, RoutePoint } from "@/types/domain"
import { cn } from "@/lib/cn"

/** Snap des Karten-Klicks auf den nächstgelegenen Streckenpunkt (Haversine, km). */
function snapToRoutes(
  p: RoutePoint,
  routes: Project["routes"],
): { punkt: RoutePoint; distKm: number } | null {
  const R = 6371
  let best: { punkt: RoutePoint; distKm: number } | null = null
  for (const r of routes) {
    for (const q of r.points) {
      const dLat = ((q.lat - p.lat) * Math.PI) / 180
      const dLng = ((q.lng - p.lng) * Math.PI) / 180
      const la1 = (p.lat * Math.PI) / 180
      const la2 = (q.lat * Math.PI) / 180
      const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2)
      const d = 2 * R * Math.asin(Math.sqrt(h))
      if (!best || d < best.distKm) best = { punkt: q, distKm: d }
    }
  }
  return best
}

export function KarteTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** ausgeblendete Strecken-IDs (Ebenen-Panel). */
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [layersOpen, setLayersOpen] = useState(true)
  /** Klickmodus „Eintrag erstellen" + gesnappte Position fürs Formular. */
  const [addMode, setAddMode] = useState(false)
  const [addPosition, setAddPosition] = useState<RoutePoint | null>(null)
  const live = useDataSourceStore((s) => s.mode) === "live"
  const runAnalysis = useProjectStore((s) => s.runAnalysis)

  const sichtbareRouten = useMemo(
    () => project.routes.filter((r) => !hidden.has(r.id)),
    [project.routes, hidden],
  )
  const sichtbareFindings = useMemo(
    () => project.findings.filter((f) => !f.routeId || !hidden.has(f.routeId)),
    [project.findings, hidden],
  )

  if (project.status !== "fertig" || !project.routes.some((r) => r.points.length >= 2)) {
    return (
      <div className="mx-auto flex h-full max-w-2xl items-center px-4 py-10">
        <EmptyState
          icon={MapPinned}
          title="Noch keine Auswertung"
          description="Lade die Strecke(n) hoch und starte die Auswertung — die Funde erscheinen dann hier auf der Karte."
          cta={
            <Button onClick={() => navigate(`/projekte/${project.id}/anlage`)}>Zur Anlage</Button>
          }
        />
      </div>
    )
  }

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: sichtbareFindings.filter((f) => f.severity === sev).length,
  }))
  // Unique Kategorien auf den sichtbaren Strecken — für die Legende.
  const kategoriesOnRoute = Array.from(new Set(sichtbareFindings.map((f) => f.kategorie))).sort(
    (a, b) => KATEGORIE_META[a].label.localeCompare(KATEGORIE_META[b].label),
  )
  const selected = sichtbareFindings.find((f) => f.id === selectedId)

  const toggleRoute = (routeId: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(routeId)) next.delete(routeId)
      else next.add(routeId)
      return next
    })
  }

  /** Klick im Eintrag-Modus: an die Strecke snappen (max. 300 m), Dialog öffnen. */
  const onMapClick = (p: RoutePoint) => {
    if (!addMode) return
    const snap = snapToRoutes(p, sichtbareRouten)
    if (!snap || snap.distKm > 0.3) {
      toast.error("Bitte näher an die Strecke klicken (max. 300 m).")
      return
    }
    setAddMode(false)
    setAddPosition(snap.punkt)
  }

  return (
    <div className="relative h-full w-full">
      <RouteMap
        routes={sichtbareRouten}
        findings={sichtbareFindings}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMapClick={addMode ? onMapClick : undefined}
      />

      {/* Klickmodus-Banner */}
      {addMode ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[600] -translate-x-1/2">
          <div className="glass pointer-events-auto flex animate-rise-in items-center gap-3 px-4 py-2.5">
            <MapPinPlus className="h-4 w-4 text-primary-600" />
            <span className="text-sm font-medium text-neutral-800">
              Auf die Strecke klicken, um den Eintrag zu platzieren
            </span>
            <button
              onClick={() => setAddMode(false)}
              className="cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {/* Links oben: Routen-Kennzahlen + Ebenen-Panel */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex w-[280px] max-w-[calc(100%-1.5rem)] flex-col gap-2">
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-neutral-200/70 pt-2">
            {counts.map(({ sev, n }) => (
              <span
                key={sev}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                  n > 0
                    ? SEVERITY_META[sev].soft
                    : "border-neutral-200 bg-neutral-50 text-neutral-400",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 shrink-0 rounded-full",
                    n > 0 ? SEVERITY_META[sev].dot : "bg-neutral-300",
                  )}
                />
                {n} {SEVERITY_META[sev].label}
              </span>
            ))}
          </div>
        </div>

        {/* Ebenen-Panel — Strecken ein-/ausblenden (wie Ebenen in Paint) */}
        <div
          className="glass pointer-events-auto animate-rise-in"
          style={{ animationDelay: "60ms" }}
        >
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            aria-expanded={layersOpen}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
          >
            <Layers className="h-4 w-4 text-primary-600" />
            <span className="flex-1 text-sm font-semibold text-neutral-800">Strecken</span>
            <span className="text-[11px] tabular-nums text-neutral-400">
              {sichtbareRouten.length}/{project.routes.length}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-neutral-400 transition-transform duration-200",
                layersOpen && "rotate-180",
              )}
            />
          </button>
          {layersOpen ? (
            <ul className="border-t border-neutral-200/70 px-2 py-1.5">
              {project.routes.map((r) => {
                const sichtbar = !hidden.has(r.id)
                const funde = project.findings.filter((f) => f.routeId === r.id).length
                return (
                  <li key={r.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-neutral-100/70",
                        !sichtbar && "opacity-55",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={sichtbar}
                        onChange={() => toggleRoute(r.id)}
                        className="h-3.5 w-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                        aria-label={`Strecke ${r.name} ${sichtbar ? "ausblenden" : "einblenden"}`}
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                        style={{ background: r.farbe }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">
                        {r.name}
                      </span>
                      <span className="text-[10px] tabular-nums text-neutral-400">
                        {routeLengthKm(r.points).toLocaleString("de-DE")} km · {funde}
                      </span>
                      {sichtbar ? (
                        <Eye className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-neutral-300" aria-hidden />
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {/* Kunden-Eintrag per Karten-Klick (nur Live-Modus) */}
          {live && !addMode ? (
            <div className="border-t border-neutral-200/70 px-2 py-1.5">
              <button
                onClick={() => {
                  setSelectedId(null)
                  setAddMode(true)
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
              >
                <MapPinPlus className="h-4 w-4" />
                Eintrag auf der Strecke erstellen
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Legende oben rechts: Kategorien, die auf den sichtbaren Strecken vorkommen */}
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
                const count = sichtbareFindings.filter((f) => f.kategorie === kat).length
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
              {selected.routeName ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        project.routes.find((r) => r.id === selected.routeId)?.farbe ?? "#71717A",
                    }}
                  />
                  {selected.routeName}
                </p>
              ) : null}
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
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
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

      {/* Formular für den Kunden-Eintrag (gesnappte Position) */}
      <ObstacleDialog
        position={addPosition}
        onClose={() => setAddPosition(null)}
        onCreated={() => {
          setAddPosition(null)
          toast.success("Eintrag gespeichert — er fließt in künftige Auswertungen ein.", {
            action: { label: "Jetzt neu auswerten", onClick: () => runAnalysis(project.id) },
            duration: 8000,
          })
        }}
      />
    </div>
  )
}
