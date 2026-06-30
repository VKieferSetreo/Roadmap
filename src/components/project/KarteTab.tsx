// Tab 2 — Vollbild-Karte mit allen Strecken (farblich getrennt) + Fund-Markern.
// Ebenen-Panel (aufklappbar, Checkboxen) blendet Strecken samt ihrer Funde ein/aus.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronUp,
  Clock,
  EyeOff,
  Filter,
  Layers,
  MapPinned,
  Pencil,
  Route as RouteIcon,
  Search,
  X,
} from "lucide-react"
import { RouteMap } from "@/components/map/RouteMap"
import { MapTimeline } from "@/components/map/MapTimeline"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { KategorieGlyph } from "./KategorieGlyph"
import { ObstacleDialog } from "./ObstacleDialog"
import { HideReasonDialog } from "./HideReasonDialog"
import { RouteEditDialog } from "./RouteEditDialog"
import { katMeta, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { useDataSourceStore } from "@/store/datasource"
import { useProjectStore } from "@/store/projects"
import { useContextStore } from "@/store/context"
import { useViewPrefsStore } from "@/store/viewPrefs"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import { routeFreigegeben } from "@/types/domain"
import type { Finding, FindingSeverity, Project, ProjectRoute, RoutePoint } from "@/types/domain"
import { cn } from "@/lib/cn"

/** Ist der Fund im gewählten Zeitfenster aktiv? Funde ohne Gültigkeit gelten als permanent
 *  und bleiben immer sichtbar (T-198). [start,end] in ms; bis-Datum inkl. ganzem Tag. */
function findingInTime(f: Finding, start: number, end: number): boolean {
  if (!f.gueltigVon && !f.gueltigBis) return true
  const von = f.gueltigVon ? Date.parse(f.gueltigVon) : -Infinity
  const bis = f.gueltigBis ? Date.parse(f.gueltigBis) + 86_399_000 : Infinity
  return von <= end && bis >= start
}

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
  canHide = false,
  canChat = true,
}: {
  project: Project
  /** Optionales Element unten im linken Overlay-Stack (gap-2 unter "Strecken").
   *  In der App = Sidebar-Toggle; in der öffentlichen Freigabe-Ansicht leer. */
  overlayFooter?: ReactNode
  /** Funde für die Auswertung ausblenden anbieten. App = true, öffentliche Freigabe = false.
   *  (Demo patcht lokal, live persistiert per API — daher nicht an `live` gekoppelt.) */
  canHide?: boolean
  /** Baustellen-Chat anbieten. App = true; öffentliche Freigabe = false (T-224). */
  canChat?: boolean
}) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Account-Schlüssel für die persistierten Viewer-Prefs (E-Mail; "demo" ohne Account). */
  const accountKey = useContextStore((s) => s.email) || "demo"
  const getHiddenPref = useViewPrefsStore((s) => s.getHidden)
  const setHiddenPref = useViewPrefsStore((s) => s.setHidden)
  const hydrateHiddenPref = useViewPrefsStore((s) => s.hydrate)
  /** ausgeblendete Strecken-IDs (Ebenen-Panel) — T-622 pro Account+Projekt persistiert. Sofort aus dem
   *  localStorage-Cache hydriert (kein Flackern), beim Mount mit dem Backend abgeglichen. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(getHiddenPref(accountKey, project.id)))
  const [layersOpen, setLayersOpen] = useState(false)
  /** Strecke im Editor (T-197), null = geschlossen. */
  const [editRoute, setEditRoute] = useState<ProjectRoute | null>(null)
  /** Kategorie-Panel (unter Strecken) auf-/zugeklappt. Beide standardmäßig EINGEKLAPPT. */
  const [katOpen, setKatOpen] = useState(false)
  /** ausgeblendete Kategorien (Kategorie-Filter oben rechts). Leer = alle sichtbar. */
  const [katHidden, setKatHidden] = useState<Set<string>>(new Set())
  /** ausgeblendete Severities (Klick auf die Zähler-Marken oben links). Default: „Warnung" +
   *  „Hinweis" versteckt → die Karte zeigt zunächst nur kritische Funde, der Rest ist über die
   *  Severity-Chips (oben rechts) zuschaltbar (Max 2026-06-29). */
  const [severityHidden, setSeverityHidden] = useState<Set<FindingSeverity>>(
    () => new Set<FindingSeverity>(["warnung", "hinweis"]),
  )
  /** gesnappte Position des Strecken-Klicks fürs Eintrag-Formular. */
  const [addPosition, setAddPosition] = useState<RoutePoint | null>(null)
  const live = useDataSourceStore((s) => s.mode) === "live"
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const running = useProjectStore((s) => s.analysis[project.id]?.running ?? false) // T-220
  const hideFinding = useProjectStore((s) => s.hideFinding)
  const unhideFinding = useProjectStore((s) => s.unhideFinding)
  /** Fund, der gerade ausgeblendet wird (öffnet die Grund-Abfrage). */
  const [hideTarget, setHideTarget] = useState<Finding | null>(null)
  /** „Ausgeblendet"-Marke: ausgeblendete Funde als graue Geister-Marker zeigen. Default AUS (wie
   *  Warnung/Hinweis). An → graue Pins, Klick darauf blendet wieder ein. Nur in der App (canHide). */
  const [zeigeAusgeblendet, setZeigeAusgeblendet] = useState(false)

  // Hat der Nutzer in DIESER Ansicht eine Strecke getoggelt? Dann darf ein verspätet eintreffender
  // Backend-GET seine frische Auswahl NICHT mehr überschreiben (Race → Toggle würde zurückschnappen).
  // Bei Projektwechsel remountet KarteTab (key={project.id} in ProjectDetail) → Ref startet je Projekt frisch.
  const routenBeruehrtRef = useRef(false)
  // T-622: gespeicherte Strecken-Sichtbarkeit dieses Accounts beim Mount aus dem Backend holen und die
  // lokale Auswahl + den Cache damit abgleichen (Quelle der Wahrheit, geräteübergreifend). Nur App (canHide)
  // + live; der öffentliche Share-Viewer hat keinen Account und bleibt ephemer.
  useEffect(() => {
    if (!canHide || !live) return
    let abgebrochen = false
    api
      .getViewerRoutes(project.id)
      .then(({ hiddenRouteIds }) => {
        if (abgebrochen || routenBeruehrtRef.current) return // Nutzer-Toggle gewinnt gegen verspäteten GET
        hydrateHiddenPref(accountKey, project.id, hiddenRouteIds)
        setHidden(new Set(hiddenRouteIds))
      })
      .catch(() => {}) // Cache-Wert bleibt bestehen
    return () => {
      abgebrochen = true
    }
  }, [canHide, live, project.id, accountKey, hydrateHiddenPref])

  // Prüfen-Gate (T-598): ungeprüfte VEMAGS-Strecken fließen nicht in die Auswertung und werden auf
  // der Karte nicht gezeichnet → sie dürfen auch im Ebenen-Register/in den Kennzahlen nicht auftauchen
  // (sonst stehen sie klickbar im Register, ohne dass die Karte etwas zeigt). Nur freigegebene zeigen.
  const freigegebeneRouten = useMemo(
    () => project.routes.filter(routeFreigegeben),
    [project.routes],
  )
  const sichtbareRouten = useMemo(
    () => freigegebeneRouten.filter((r) => !hidden.has(r.id)),
    [freigegebeneRouten, hidden],
  )
  // Ein Fund liegt oft auf MEHREREN Strecken (T-621: gleiche Stelle, beide befahren sie). Er bleibt
  // sichtbar, solange IRGENDEINE seiner befahrenden Strecken eingeblendet ist — nicht nur die eine
  // Repräsentanten-Strecke. Ohne Routen-Bezug (manuelle/Legacy-Funde) immer sichtbar.
  const findingAufSichtbarerRoute = useMemo(() => {
    return (f: Finding): boolean => {
      const ids = f.routeIds ?? (f.routeId ? [f.routeId] : [])
      return ids.length === 0 || ids.some((id) => !hidden.has(id))
    }
  }, [hidden])
  // Ausgeblendete Funde (f.hidden) erscheinen NIE auf der Karte/Legende/Zählung.
  const sichtbareFindings = useMemo(
    () => project.findings.filter((f) => !f.hidden && findingAufSichtbarerRoute(f)),
    [project.findings, findingAufSichtbarerRoute],
  )
  // Kategorie-Filter (oben rechts) angewandt → nur das landet auf der Karte + in der Suche.
  // kategoriesOnRoute (Filter-Liste) bleibt aus sichtbareFindings → alle Kategorien immer wählbar.
  /** Zeitfenster aus dem Karten-Zeitstrahl (ms) — null = kein Zeitfilter. */
  const [timeWin, setTimeWin] = useState<{ start: number; end: number } | null>(null)
  const zeitstrahlAktiv =
    Boolean(project.zeitraum?.von && project.zeitraum?.bis) &&
    Date.parse(project.zeitraum.bis!) > Date.parse(project.zeitraum.von!)
  const gefilterteFindings = useMemo(() => {
    const base =
      katHidden.size === 0 && severityHidden.size === 0
        ? sichtbareFindings
        : sichtbareFindings.filter((f) => !katHidden.has(f.kategorie) && !severityHidden.has(f.severity))
    return timeWin ? base.filter((f) => findingInTime(f, timeWin.start, timeWin.end)) : base
  }, [sichtbareFindings, katHidden, severityHidden, timeWin])

  // Ausgeblendete Funde (f.hidden) auf sichtbaren Strecken, im Zeitfenster — eigene Achse, NICHT an
  // Severity-/Kategorie-Filter gekoppelt. Zähler fürs „Ausgeblendet"-Chip; bei aktivem Chip als graue
  // Geister-Marker auf der Karte (Klick → wieder einblenden).
  const ausgeblendeteFindings = useMemo(
    () =>
      project.findings.filter(
        (f) =>
          f.hidden &&
          findingAufSichtbarerRoute(f) &&
          (!timeWin || findingInTime(f, timeWin.start, timeWin.end)),
      ),
    [project.findings, findingAufSichtbarerRoute, timeWin],
  )

  // ── Ticket-Suche (Strg+F über alle sichtbaren Funde der Ansicht) ──────────────
  const [suche, setSuche] = useState("")
  const [trefferIdx, setTrefferIdx] = useState(-1) // -1 = noch nicht gesprungen
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const nonceRef = useRef(0)

  // Deep-Link aus einer Mitteilung: /projekte/:id/karte?focus=<obstacleId> → zum Fund springen,
  // Marker selektieren. Wartet, bis die Funde geladen sind; feuert genau einmal.
  const [searchParams, setSearchParams] = useSearchParams()
  const focusedRef = useRef(false)
  useEffect(() => {
    if (focusedRef.current) return
    const focus = searchParams.get("focus")
    if (!focus || project.findings.length === 0) return
    const f = project.findings.find((x) => x.obstacleId === focus || x.id === focus)
    if (f && Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      focusedRef.current = true
      setSelectedId(f.id)
      nonceRef.current += 1
      setFocusPoint({ lat: f.lat, lng: f.lng, nonce: nonceRef.current })
      const next = new URLSearchParams(searchParams)
      next.delete("focus")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, project.findings, setSearchParams])

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

  // T-220: Karte während (Re-)Auswertung sichtbar lassen (running/vorhandene Funde) statt Empty-Flash;
  // ohne Strecken-Punkte gibt es nichts zu zeigen.
  const hatRouten = freigegebeneRouten.some((r) => r.points.length >= 2)
  if (!hatRouten || (project.status !== "fertig" && !running && project.findings.length === 0)) {
    return (
      <div className="mx-auto flex h-full max-w-2xl items-center px-4 py-10">
        <EmptyState
          icon={MapPinned}
          title="Noch keine Auswertung"
          description="Laden Sie die Strecke(n) hoch und starten Sie die Auswertung. Die Funde erscheinen dann hier auf der Karte."
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
  // #5 (Max 2026-06-21): bei vielen Strecken Durchschnitt je Strecke statt sinnloser Gesamtsumme.
  const usableRoutes = freigegebeneRouten.filter((r) => r.points.length >= 2)
  const mehrereStrecken = usableRoutes.length > 1
  const avgKm = usableRoutes.length
    ? usableRoutes.reduce((a, r) => a + routeLengthKm(r.points), 0) / usableRoutes.length
    : (project.distanzKm ?? 0)
  const streckeKm = mehrereStrecken ? Math.round(avgKm * 10) / 10 : (project.distanzKm ?? 0)
  const fahrzeitMin = mehrereStrecken ? Math.round((avgKm / 50) * 60) : (project.fahrzeitMin ?? 0)
  // Unique Kategorien auf den sichtbaren Strecken — für die Legende.
  const kategoriesOnRoute = Array.from(new Set(sichtbareFindings.map((f) => f.kategorie))).sort(
    (a, b) => katMeta(a).label.localeCompare(katMeta(b).label),
  )
  const toggleRoute = (routeId: string) => {
    const next = new Set(hidden)
    if (next.has(routeId)) next.delete(routeId)
    else next.add(routeId)
    setHidden(next)
    routenBeruehrtRef.current = true // ab jetzt darf ein verspäteter Backend-GET nicht mehr klobbern
    // Persistenz nur in der App (canHide) — der öffentliche Share-Viewer bleibt wirklich ephemer
    // (kein localStorage-Schreiben, kein Backend), wie die Doku verspricht.
    if (canHide) setHiddenPref(accountKey, project.id, [...next])
  }
  /** Kategorie im Filter (oben rechts) ein-/ausblenden. */
  const toggleKat = (kat: string) =>
    setKatHidden((prev) => {
      const next = new Set(prev)
      if (next.has(kat)) next.delete(kat)
      else next.add(kat)
      return next
    })
  /** Severity per Klick auf die Zähler-Marke (oben links) ein-/ausblenden. */
  const toggleSeverity = (sev: FindingSeverity) =>
    setSeverityHidden((prev) => {
      const next = new Set(prev)
      if (next.has(sev)) next.delete(sev)
      else next.add(sev)
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
      toast.success("Eigener Eintrag verworfen. Auswertung wird aufgefrischt.")
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
        onHide={canHide ? (f) => setHideTarget(f) : undefined}
        ghostFindings={canHide && zeigeAusgeblendet ? ausgeblendeteFindings : undefined}
        onUnhide={canHide ? (f) => unhideFinding(project.id, f) : undefined}
        canChat={canChat}
        focusPoint={focusPoint}
      >

      {/* Ticket-Suche — oben links, durchsucht alle sichtbaren Funde (Titel/Text/km/Quelle/Details). */}
      <div className="absolute left-3 top-3 z-[1100] w-[min(92%,520px)]">
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2.5 shadow-lg">
          <Search className="h-[18px] w-[18px] shrink-0 text-neutral-400" />
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
            placeholder="In Datenpunkten suchen …"
            aria-label="In Datenpunkten suchen"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-800 outline-none placeholder:text-neutral-400"
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

      {/* Rechts oben: Routen-Kennzahlen + Ebenen-Panel + Kategorien */}
      {/* T-244: unter lg liegt oben links die Suchleiste — den Eckdaten-/Severity-Stack darunter
          schieben (top-[4.5rem]) statt daneben (Kollision auf dem Phone). Ab lg wieder oben rechts. */}
      <div className="pointer-events-none absolute right-3 top-[4.5rem] z-[500] flex w-[280px] max-w-[calc(100%-1.5rem)] flex-col gap-2 lg:top-3">
        <div className="glass pointer-events-auto animate-rise-in p-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-neutral-700" title={mehrereStrecken ? "Durchschnitt je Strecke" : undefined}>
              <RouteIcon className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">
                {mehrereStrecken ? "Ø " : ""}{streckeKm.toLocaleString("de-DE")} km
              </strong>
            </span>
            <span className="flex items-center gap-1.5 text-neutral-700" title={mehrereStrecken ? "Durchschnitt je Strecke" : undefined}>
              <Clock className="h-4 w-4 text-primary-600" />
              <strong className="tabular-nums">
                {mehrereStrecken ? "Ø " : ""}{Math.floor(fahrzeitMin / 60)} h {fahrzeitMin % 60} min
              </strong>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-neutral-200/70 pt-2">
            {counts.filter(({ n }) => n > 0).map(({ sev, n }) => {
              const aus = severityHidden.has(sev)
              // counts ist auf n>0 gefiltert → jede gerenderte Stufe ist klickbar.
              // Klick blendet diese Funde auf der Karte aus und dimmt die Marke grau.
              const aktiv = !aus
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  aria-pressed={!aus}
                  title={aus ? `${SEVERITY_META[sev].label} einblenden` : `${SEVERITY_META[sev].label} ausblenden`}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition hover:opacity-80",
                    aktiv ? SEVERITY_META[sev].soft : "border-neutral-200 bg-neutral-50 text-neutral-400",
                    aus && "line-through",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-2 w-2 shrink-0 rounded-full",
                      aktiv ? SEVERITY_META[sev].dot : "bg-neutral-300",
                    )}
                  />
                  {n} {SEVERITY_META[sev].label}
                </button>
              )
            })}
            {/* Kein „Alle"-Reset (Max 2026-06-23): ein erneuter Klick auf eine durchgestrichene
                Schweregrad-Marke blendet sie wieder ein — der separate Reset-Button entfällt. */}
            {/* „Ausgeblendet"-Marke (nur App, nur wenn es ausgeblendete Funde gibt): eigene Achse neben
                den Schweregraden. Default AUS; an → graue Geister-Marker, Klick darauf blendet wieder ein. */}
            {canHide && ausgeblendeteFindings.length > 0 ? (
              <button
                type="button"
                onClick={() => setZeigeAusgeblendet((v) => !v)}
                aria-pressed={zeigeAusgeblendet}
                title={zeigeAusgeblendet ? "Ausgeblendete verbergen" : "Ausgeblendete grau anzeigen (zum Wieder-Einblenden)"}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition hover:opacity-80",
                  zeigeAusgeblendet
                    ? "border-neutral-300 bg-neutral-100 text-neutral-700"
                    : "border-neutral-200 bg-neutral-50 text-neutral-400",
                  !zeigeAusgeblendet && "line-through",
                )}
              >
                <EyeOff
                  className={cn("h-3 w-3 shrink-0", zeigeAusgeblendet ? "text-neutral-500" : "text-neutral-400")}
                />
                {ausgeblendeteFindings.length} Ausgeblendet
              </button>
            ) : null}
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
              {sichtbareRouten.length}/{freigegebeneRouten.length}
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
              {freigegebeneRouten.map((r) => {
                const sichtbar = !hidden.has(r.id)
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md transition-colors hover:bg-neutral-100/70",
                      !sichtbar && "opacity-55",
                    )}
                  >
                    {/* min-w-0 am label = truncate des Namens greift; sonst überläuft der Name und
                        drückt die km-Spalte raus. */}
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 py-1.5">
                      <input
                        type="checkbox"
                        checked={sichtbar}
                        onChange={() => toggleRoute(r.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
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
                      {/* feste, rechtsbündige km-Spalte (bis 4-stellig: "9.999 km") → Werte fluchten, nichts rutscht */}
                      <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-neutral-400">
                        {routeLengthKm(r.points).toLocaleString("de-DE")} km
                      </span>
                    </label>
                    {/* Stift nur bei Hover/Fokus der Zeile → Ruhezustand bleibt sauber (Name + km), Edit bleibt erreichbar */}
                    <button
                      onClick={() => setEditRoute(r)}
                      title="Strecke bearbeiten"
                      aria-label={`Strecke ${r.name} bearbeiten`}
                      className="mr-1 shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200/70 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>

        {/* Kategorie-Filter — direkt unter "Strecken", gleiche Breite (Stack = w-280),
            einklappbar. Klick blendet eine Kategorie auf Karte + Ticket-Suche aus. */}
        {kategoriesOnRoute.length > 0 ? (
          <div className="glass pointer-events-auto animate-rise-in" style={{ animationDelay: "80ms" }}>
            <button
              type="button"
              onClick={() => setKatOpen((o) => !o)}
              aria-expanded={katOpen}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
            >
              <Filter className="h-4 w-4 text-primary-600" />
              <span className="flex-1 text-sm font-semibold text-neutral-800">Kategorien</span>
              {katHidden.size > 0 ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setKatHidden(new Set())
                  }}
                  className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 hover:text-primary-700"
                >
                  Alle
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-neutral-400 transition-transform duration-200",
                  katOpen && "rotate-180",
                )}
              />
            </button>
            {katOpen ? (
              <ul className="flex flex-col gap-0.5 border-t border-neutral-200/70 px-2 py-1.5">
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
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Slot unter den Panels — gap-2. In der App: Sidebar-Ein-/Ausklapp-Toggle. */}
        {overlayFooter}
      </div>

      {/* Zeitstrahl (T-198) — unten in der Karte, filtert Funde nach Transport-Zeitraum. */}
      {zeitstrahlAktiv ? (
        <MapTimeline
          von={project.zeitraum.von!}
          bis={project.zeitraum.bis!}
          onWindowChange={setTimeWin}
        />
      ) : null}
      </RouteMap>

      {/* Formular für den Kunden-Eintrag (gesnappte Position) */}
      <ObstacleDialog
        position={addPosition}
        onClose={() => setAddPosition(null)}
        onCreated={() => {
          setAddPosition(null)
          toast.success("Eintrag gespeichert. Er fließt in künftige Auswertungen ein.", {
            action: { label: "Jetzt neu auswerten", onClick: () => runAnalysis(project.id) },
            duration: 8000,
          })
        }}
      />

      {/* Fund für die Sichtung ausblenden (nicht löschen) — Grund-Abfrage wie im Dashboard. */}
      {hideTarget ? (
        <HideReasonDialog
          finding={hideTarget}
          onClose={() => setHideTarget(null)}
          onConfirm={(grund, grundText) => hideFinding(project.id, hideTarget, grund, grundText)}
        />
      ) : null}

      {/* Strecken-Editor (T-197): Wegpunkte ziehen/fixieren → live OSRM → Speichern re-analysiert. */}
      <RouteEditDialog
        open={!!editRoute}
        route={editRoute}
        projectId={project.id}
        onClose={() => setEditRoute(null)}
      />
    </div>
  )
}
