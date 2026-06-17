// Tab 2 — Vollbild-Karte mit allen Strecken (farblich getrennt) + Fund-Markern.
// Ebenen-Panel (aufklappbar, Checkboxen) blendet Strecken samt ihrer Funde ein/aus.

import { useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Layers,
  MapPinned,
  Route as RouteIcon,
  Search,
  X,
} from "lucide-react"
import { RouteMap } from "@/components/map/RouteMap"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { KategorieGlyph } from "./KategorieGlyph"
import { ObstacleDialog } from "./ObstacleDialog"
import { katMeta, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { useDataSourceStore } from "@/store/datasource"
import { useProjectStore } from "@/store/projects"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"
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

export function KarteTab({
  project,
  overlayFooter,
}: {
  project: Project
  /** Optionales Element unten im linken Overlay-Stack (gap-2 unter "Strecken").
   *  In der App = Sidebar-Toggle; in der öffentlichen Freigabe-Ansicht leer. */
  overlayFooter?: ReactNode
}) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** ausgeblendete Strecken-IDs (Ebenen-Panel). */
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [layersOpen, setLayersOpen] = useState(true)
  /** ausgeblendete Kategorien (Kategorie-Filter oben rechts). Leer = alle sichtbar. */
  const [katHidden, setKatHidden] = useState<Set<string>>(new Set())
  /** gesnappte Position des Strecken-Klicks fürs Eintrag-Formular. */
  const [addPosition, setAddPosition] = useState<RoutePoint | null>(null)
  const live = useDataSourceStore((s) => s.mode) === "live"
  const runAnalysis = useProjectStore((s) => s.runAnalysis)

  const sichtbareRouten = useMemo(
    () => project.routes.filter((r) => !hidden.has(r.id)),
    [project.routes, hidden],
  )
  // Ausgeblendete Funde (f.hidden) erscheinen NIE auf der Karte/Legende/Zählung.
  const sichtbareFindings = useMemo(
    () => project.findings.filter((f) => !f.hidden && (!f.routeId || !hidden.has(f.routeId))),
    [project.findings, hidden],
  )
  const ausgeblendetN = useMemo(() => project.findings.filter((f) => f.hidden).length, [project.findings])
  // Kategorie-Filter (oben rechts) angewandt → nur das landet auf der Karte + in der Suche.
  // kategoriesOnRoute (Filter-Liste) bleibt aus sichtbareFindings → alle Kategorien immer wählbar.
  const gefilterteFindings = useMemo(
    () => (katHidden.size === 0 ? sichtbareFindings : sichtbareFindings.filter((f) => !katHidden.has(f.kategorie))),
    [sichtbareFindings, katHidden],
  )

  // ── Ticket-Suche (Strg+F über alle sichtbaren Funde der Ansicht) ──────────────
  const [suche, setSuche] = useState("")
  const [trefferIdx, setTrefferIdx] = useState(-1) // -1 = noch nicht gesprungen
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const nonceRef = useRef(0)

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase()
    if (!s) return []
    return gefilterteFindings.filter((f) => {
      const text = [
        f.titel, f.beschreibung, f.strassenRef, f.routeName, f.quelle?.name,
        ...Object.values(f.detail ?? {}),
      ].filter(Boolean).join(" ").toLowerCase()
      return text.includes(s)
    })
  }, [suche, gefilterteFindings])

  const springeZu = (idx: number) => {
    if (treffer.length === 0) return
    const i = ((idx % treffer.length) + treffer.length) % treffer.length
    setTrefferIdx(i)
    const f = treffer[i]
    setSelectedId(f.id)
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      nonceRef.current += 1
      setFocusPoint({ lat: f.lat, lng: f.lng, nonce: nonceRef.current })
    }
  }
  const sucheLeeren = () => {
    setSuche("")
    setTrefferIdx(-1)
  }

  if (project.status !== "fertig" || !project.routes.some((r) => r.points.length >= 2)) {
    return (
      <div className="mx-auto flex h-full max-w-2xl items-center px-4 py-10">
        <EmptyState
          icon={MapPinned}
          title="Noch keine Auswertung"
          description="Lade die Strecke(n) hoch und starte die Auswertung — die Funde erscheinen dann hier auf der Karte."
          cta={
            <Button onClick={() => navigate(`/projekte/${project.id}/route`)}>Zur Eingabe</Button>
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
    (a, b) => katMeta(a).label.localeCompare(katMeta(b).label),
  )
  const toggleRoute = (routeId: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(routeId)) next.delete(routeId)
      else next.add(routeId)
      return next
    })
  }
  /** Kategorie im Filter (oben rechts) ein-/ausblenden. */
  const toggleKat = (kat: string) =>
    setKatHidden((prev) => {
      const next = new Set(prev)
      if (next.has(kat)) next.delete(kat)
      else next.add(kat)
      return next
    })

  /** Klick direkt auf eine Strecke (nur Live): an den nächsten Streckenpunkt
   *  snappen und die Eintrag-Maske öffnen. Kein Modus, kein Button. */
  const onRouteClick = (p: RoutePoint) => {
    const snap = snapToRoutes(p, sichtbareRouten)
    if (!snap) return
    setSelectedId(null)
    setAddPosition(snap.punkt)
  }

  /** Eigenen Eintrag verwerfen: Hindernis löschen, dann neu auswerten (Fund verschwindet). */
  const onDeleteOwn = async (obstacleId: string) => {
    try {
      await api.deleteObstacle(obstacleId)
      setSelectedId(null)
      toast.success("Eigener Eintrag verworfen — Auswertung wird aufgefrischt.")
      await runAnalysis(project.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verwerfen fehlgeschlagen.")
    }
  }

  return (
    <div className="relative h-full w-full">
      <RouteMap
        routes={sichtbareRouten}
        findings={gefilterteFindings}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRouteClick={live ? onRouteClick : undefined}
        onDeleteOwn={live ? (id) => void onDeleteOwn(id) : undefined}
        focusPoint={focusPoint}
      />

      {/* Ticket-Suche — oben mittig, durchsucht alle sichtbaren Funde (Titel/Text/km/Quelle/Details). */}
      <div className="absolute left-1/2 top-3 z-[1100] w-[min(92%,460px)] -translate-x-1/2">
        <div className="glass flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shadow-lg">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            value={suche}
            onChange={(e) => {
              setSuche(e.target.value)
              setTrefferIdx(-1)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                springeZu(e.shiftKey ? trefferIdx - 1 : trefferIdx + 1)
              } else if (e.key === "Escape") {
                sucheLeeren()
              }
            }}
            placeholder="In Tickets suchen (z. B. Bauwerksnummer) …"
            aria-label="Tickets in der Karte durchsuchen"
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
          {suche ? (
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
              {treffer.length === 0 ? "0" : trefferIdx < 0 ? `${treffer.length} Treffer` : `${trefferIdx + 1}/${treffer.length}`}
            </span>
          ) : null}
          {treffer.length > 0 ? (
            <>
              <button
                onClick={() => springeZu(trefferIdx - 1)}
                aria-label="Vorheriger Treffer"
                className="shrink-0 cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => springeZu(trefferIdx + 1)}
                aria-label="Nächster Treffer"
                className="shrink-0 cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </>
          ) : null}
          {suche ? (
            <button
              onClick={sucheLeeren}
              aria-label="Suche leeren"
              className="shrink-0 cursor-pointer rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

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
                const funde = project.findings.filter((f) => !f.hidden && f.routeId === r.id).length
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
        </div>

        {/* Slot unter dem "Strecken"-Kasten — gap-2 (exakt wie zwischen den Karten oben).
            In der App: Sidebar-Ein-/Ausklapp-Toggle. */}
        {overlayFooter}
      </div>

      {/* Kategorie-Filter oben rechts: Kategorien auf den sichtbaren Strecken — anklickbar
          ein-/ausblenden (echtes StVO-Schild je Kategorie). Filtert Karte + Ticket-Suche. */}
      {kategoriesOnRoute.length > 0 ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[500] hidden sm:block">
          <div
            className="glass pointer-events-auto min-w-[200px] animate-rise-in px-3 py-2.5"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Kategorien
              </p>
              {katHidden.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setKatHidden(new Set())}
                  className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 hover:text-primary-700"
                >
                  Alle
                </button>
              ) : null}
            </div>
            <ul className="flex flex-col gap-0.5">
              {kategoriesOnRoute.map((kat) => {
                const count = sichtbareFindings.filter((f) => f.kategorie === kat).length
                const aus = katHidden.has(kat)
                return (
                  <li key={kat}>
                    <button
                      type="button"
                      onClick={() => toggleKat(kat)}
                      aria-pressed={!aus}
                      title={aus ? "Einblenden" : "Ausblenden"}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-neutral-100/70",
                        aus ? "text-neutral-400" : "text-neutral-700",
                      )}
                    >
                      <KategorieGlyph
                        kategorie={kat}
                        className={cn("h-6 w-6 shrink-0 transition", aus && "opacity-40 grayscale")}
                      />
                      <span className={cn("flex-1 truncate", aus && "line-through")}>{katMeta(kat).label}</span>
                      <span className="tabular-nums text-neutral-400">{count}</span>
                    </button>
                  </li>
                )
              })}
              {ausgeblendetN > 0 ? (
                <li className="mt-0.5 flex items-center gap-2 border-t border-neutral-100 px-1.5 pt-1.5 text-xs text-neutral-400">
                  <EyeOff className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Ausgeblendet</span>
                  <span className="tabular-nums">{ausgeblendetN}</span>
                </li>
              ) : null}
            </ul>
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
