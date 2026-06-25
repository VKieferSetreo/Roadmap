// Strecken-Editor (T-197). Zentrierte Maske (Rest abgedunkelt) aus "Bearbeiten" einer Strecke:
//  • oben Name editierbar, darunter die echte Strecke mit VIELEN dichten Stützpunkten.
//  • GUMMIBAND: Strecke an beliebiger Stelle greifen → der nächste bestehende Punkt zieht
//    mit dem Cursor mit (es wird KEIN neuer Punkt gesetzt); OSRM rechnet live neu (debounced).
//  • „Original" stellt den ursprünglichen Verlauf wieder her. Speichern → Auswertung läuft neu.
// Der Export (Datei/Google-Link) ist aus route.points abgeleitet → bleibt nach Save konsistent.
import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { AlertTriangle, Flag, Loader2, Route, RotateCcw, Save, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { MapLayers } from "@/components/map/MapControls"
import { useProjectStore } from "@/store/projects"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { api } from "@/api/roadmap"
import type { ProjectRoute, RoutePoint } from "@/types/domain"

// Wegpunkte des Editors = NUR Start + Ziel. Zwischenpunkte fügt der Nutzer gezielt per Linien-
// Greifen hinzu (jeder ist dann ein echter Wegpunkt). #20 (Max 2026-06-21): vorher wurden ~8 dichte
// Stützpunkte aus der Altstrecke abgeleitet — die pinnten die alte Route, sodass ein gezogener Punkt
// zwischen zwei eng benachbarten Altpunkten eine Spitze/Wende erzeugte (von links zu A, wenden,
// zurück, dann zu B). Mit nur Start/Ziel routet OSRM jede Teilstrecke unabhängig als schnellsten
// Weg → kein Backtracking, „einfach schnellste Route von A nach B".
function deriveControlPoints(points: RoutePoint[]): RoutePoint[] {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length <= 2) return pts.map((p) => ({ lat: p.lat, lng: p.lng }))
  return [
    { lat: pts[0].lat, lng: pts[0].lng },
    { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng },
  ]
}

// T-582: die exakten, beim Anlegen gesetzten Wegpunkte (Start/Via/Ziel) sind die wahren Kontrollpunkte
// — sie GENAU übernehmen statt sie aus den OSRM-gesnappten Geometrie-Enden zu rekonstruieren (die teils
// weit abweichen). Nur wenn ≥2 valide gespeichert sind (Start/Ziel-/Link-Strecken); sonst (Datei-Upload
// ohne Wegpunkte) der bisherige Fallback aus der Geometrie.
function controlPointsOf(route: ProjectRoute): RoutePoint[] {
  const wp = (route.waypoints ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (wp.length >= 2) return wp.map((p) => ({ lat: p.lat, lng: p.lng }))
  return deriveControlPoints(route.points)
}

/** Einfügeindex im Segment, dessen Mittelpunkt dem Greifpunkt am nächsten liegt. */
function bestInsertIndex(cps: RoutePoint[], lat: number, lng: number): number {
  if (cps.length < 2) return cps.length
  let bestIdx = 1
  let bestD = Infinity
  for (let i = 0; i < cps.length - 1; i++) {
    const mx = (cps[i].lat + cps[i + 1].lat) / 2
    const my = (cps[i].lng + cps[i + 1].lng) / 2
    const d = (mx - lat) ** 2 + (my - lng) ** 2
    if (d < bestD) {
      bestD = d
      bestIdx = i + 1
    }
  }
  return bestIdx
}

// Äquirektangulär gewichteter Abstand (lng um cos(lat) gestaucht) — bei reinem Grad-Quadrat würde
// die Längengrad-Verzerrung in DE die Reihenfolge leicht verfälschen. Reicht fürs Sortieren.
function dist(a: RoutePoint, b: RoutePoint): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const dx = (a.lat - b.lat)
  const dy = (a.lng - b.lng) * k
  return Math.hypot(dx, dy)
}

// T-#10: Optimale Einfüge-Position für Punkt p zwischen den fixen Endpunkten (Start cps[0] / Ziel
// cps[last]) — die, die die geringste ZUSATZ-Strecke verursacht (Cheapest-Insertion). So entsteht
// A-D-B-C statt A-B-D-B-C, egal an welcher Stelle der Nutzer den Punkt greift/hinzieht.
function cheapestInsertIndex(cps: RoutePoint[], p: RoutePoint): number {
  let bestIdx = 1
  let bestCost = Infinity
  for (let i = 0; i < cps.length - 1; i++) {
    const cost = dist(cps[i], p) + dist(p, cps[i + 1]) - dist(cps[i], cps[i + 1])
    if (cost < bestCost) {
      bestCost = cost
      bestIdx = i + 1
    }
  }
  return bestIdx
}

const cpIcon = (kind: "start" | "end" | "via") => {
  if (kind === "via") {
    return L.divIcon({
      className: "rm-handle",
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      html: `<div style="width:12px;height:12px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);background:#2563eb"></div>`,
    })
  }
  const bg = kind === "start" ? "#16a34a" : "#dc2626"
  const letter = kind === "start" ? "S" : "Z"
  return L.divIcon({
    className: "rm-handle",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);background:${bg};color:#fff;font:700 11px/1 Inter,system-ui,sans-serif">${letter}</div>`,
  })
}

/** Karte beim Öffnen auf die Strecke zoomen (in der Maske erst nach Layout vermessen). */
function FitOnce({ points }: { points: RoutePoint[] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length < 2) return
    done.current = true
    setTimeout(() => {
      map.invalidateSize()
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [40, 40] },
      )
    }, 60)
  }, [map, points])
  return null
}

interface RouteEditDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  route: ProjectRoute | null
  /** Prüfen-Gate (T-593): dieselbe Maske, aber rot markiert; Speichern gibt die VEMAGS-Strecke frei. */
  verificationMode?: boolean
}

export function RouteEditDialog({ open, onClose, projectId, route, verificationMode = false }: RouteEditDialogProps) {
  const updateRoute = useProjectStore((s) => s.updateRoute)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  const [name, setName] = useState("")
  const [cps, setCps] = useState<RoutePoint[]>([])
  const [geometry, setGeometry] = useState<RoutePoint[]>([])
  const [routing, setRouting] = useState(false)
  const [routingFailed, setRoutingFailed] = useState(false)
  const [touched, setTouched] = useState(false)
  const initialPoints = useRef<RoutePoint[]>([])
  const initialCps = useRef<RoutePoint[]>([]) // T-582: die exakten Start/Ziel-Wegpunkte für „Original"
  const mapRef = useRef<L.Map | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const failToastRef = useRef(false) // Toast nur beim Übergang ok→fehlgeschlagen, nicht pro Debounce.

  useEffect(() => {
    if (!open || !route) return
    setName(route.name)
    const cps0 = controlPointsOf(route)
    setCps(cps0)
    setGeometry(route.points)
    setTouched(false)
    setRoutingFailed(false)
    failToastRef.current = false
    initialPoints.current = route.points
    initialCps.current = cps0
  }, [open, route])

  const coordKey = cps.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join(";")

  // Live-Routing nach jeder Bewegung (debounced). Erst nach der ersten Nutzer-Aktion, damit
  // eine unangetastet geöffnete Strecke nicht sofort neu gesnappt wird.
  useEffect(() => {
    if (!touched || cps.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setRouting(true)
      try {
        const res = await api.route.waypoints(cps.map((c) => ({ lat: c.lat, lng: c.lng })))
        if (!cancelled) {
          setGeometry(res.points)
          setRoutingFailed(false)
          failToastRef.current = false
        }
      } catch {
        // Routing-Ausfall: Luftlinie als Platzhalter zeigen, ABER markieren — Speichern wird
        // blockiert, damit keine Pseudo-Route + Re-Analyse stillschweigend persistiert wird.
        if (!cancelled) {
          setGeometry(cps.map((c) => ({ lat: c.lat, lng: c.lng })))
          setRoutingFailed(true)
          if (!failToastRef.current) {
            failToastRef.current = true
            toast.error("Routing nicht verfügbar — die Linie ist nur eine Luftlinie. Speichern ist blockiert, bis das Routing wieder antwortet.")
          }
        }
      } finally {
        if (!cancelled) setRouting(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordKey, touched])

  const distanzKm = useMemo(() => routeLengthKm(geometry), [geometry])

  if (!open || !route) return null

  const moveCp = (i: number, lat: number, lng: number) => {
    setCps((prev) => prev.map((c, idx) => (idx === i ? { lat, lng } : c)))
    setTouched(true)
  }

  const removeCp = (i: number) => {
    if (i === 0 || i === cps.length - 1) {
      toast.error("Start und Ziel bleiben erhalten.")
      return
    }
    setCps((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))
    setTouched(true)
    toast.success("Wegpunkt entfernt.")
  }

  // T-#10: Nach dem Loslassen den (gezogenen/neu eingefügten) Zwischenpunkt an seine optimale
  // Stelle in der Reihenfolge setzen — Start/Ziel bleiben fix. Verhindert ungewollte Hin-/Rückfahrten
  // (A-B-D-B-C), egal wo der Punkt gegriffen wurde → die neue Strecke ist A-D-B-C.
  const reorderCp = (i: number) => {
    setCps((prev) => {
      if (i <= 0 || i >= prev.length - 1) return prev // Start/Ziel nie umsortieren
      const p = prev[i]
      const rest = prev.filter((_, k) => k !== i)
      const target = cheapestInsertIndex(rest, p)
      if (target === i) return prev // schon optimal → keine Änderung
      const next = [...rest]
      next.splice(target, 0, p)
      return next
    })
  }

  // Drag-Mechanik: Karten-Pan aus, Bewegung via Pointer Events verfolgen (Maus + Touch/Pen),
  // mit setPointerCapture, damit der Finger die Linie verlassen darf. Native Pointer-Koordinaten
  // werden über Leaflet zu latlng konvertiert. (T-229: vorher nur Leaflet-mouse* → auf Touch tot.)
  const startDrag = (
    origin: MouseEvent,
    onMove: (lat: number, lng: number) => void,
    onEnd?: () => void,
  ) => {
    const map = mapRef.current
    if (!map) return
    map.dragging.disable()
    const container = map.getContainer()
    const pid = "pointerId" in origin ? (origin as PointerEvent).pointerId : null
    if (pid != null) {
      try { container.setPointerCapture(pid) } catch { /* nicht kritisch */ }
    }
    const move = (ev: PointerEvent) => {
      const ll = map.mouseEventToLatLng(ev)
      onMove(ll.lat, ll.lng)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      if (pid != null) {
        try { container.releasePointerCapture(pid) } catch { /* */ }
      }
      map.dragging.enable()
      dragIdxRef.current = null
      onEnd?.()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }

  // Bestehenden Punkt anfassen: ziehen (Bewegung) ODER bei reinem Klick löschen.
  const onPointGrab = (i: number) => (e: L.LeafletMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    L.DomEvent.stop(e.originalEvent)
    const start = map.latLngToContainerPoint(e.latlng)
    let moved = false
    startDrag(
      e.originalEvent,
      (lat, lng) => {
        if (!moved && map.latLngToContainerPoint(L.latLng(lat, lng)).distanceTo(start) > 4) moved = true
        if (moved) moveCp(i, lat, lng)
      },
      () => {
        if (!moved) removeCp(i) // Klick/Tipp ohne Ziehen → entfernen
        else reorderCp(i) // gezogen → optimale Reihenfolge (kein Backtracking)
      },
    )
  }

  // Linie in einer Lücke greifen → dort NEUEN Punkt einfügen und gleich ziehen.
  const onLineGrab = (e: L.LeafletMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    L.DomEvent.stop(e.originalEvent)
    const idx = bestInsertIndex(cps, e.latlng.lat, e.latlng.lng)
    dragIdxRef.current = idx
    setCps((prev) => {
      const next = [...prev]
      next.splice(idx, 0, { lat: e.latlng.lat, lng: e.latlng.lng })
      return next
    })
    setTouched(true)
    startDrag(
      e.originalEvent,
      (lat, lng) => {
        if (dragIdxRef.current == null) return
        moveCp(dragIdxRef.current, lat, lng)
      },
      () => reorderCp(idx), // nach dem Ziehen an die optimale Stelle setzen
    )
  }

  const reset = () => {
    setCps(initialCps.current)
    setGeometry(initialPoints.current)
    setTouched(false)
    setRoutingFailed(false)
    failToastRef.current = false
  }

  const save = async () => {
    if (routingFailed) {
      toast.error("Speichern blockiert: Das Routing ist nicht verfügbar (nur Luftlinie). Bitte später erneut versuchen.")
      return
    }
    // T-594: die finale Geometrie beim Speichern aus den AKTUELLEN Kontrollpunkten FRISCH routen —
    // nicht auf das 300-ms-debounced Live-Routing verlassen. Sonst speichert ein schnelles „Speichern"
    // direkt nach einem Zug die noch-alte `geometry` (Debounce-Timer hatte noch nicht gefeuert) → die
    // manuell angepasste Strecke wird nicht so gespeichert wie zuletzt gezogen. OSRM-Cache (routeKey)
    // macht das schnell, wenn der Stand bereits geroutet ist. Unangetastet geöffnet (!touched) = keine
    // Änderung → die vorhandene geometry direkt übernehmen.
    let finalGeom = geometry
    if (touched && cps.length >= 2) {
      setRouting(true)
      try {
        const res = await api.route.waypoints(cps.map((c) => ({ lat: c.lat, lng: c.lng })))
        finalGeom = res.points
        setGeometry(res.points)
        setRoutingFailed(false)
      } catch {
        setRoutingFailed(true)
        setRouting(false)
        toast.error("Speichern blockiert: Routing nicht verfügbar (nur Luftlinie). Bitte später erneut versuchen.")
        return
      }
      setRouting(false)
    }
    if (finalGeom.length < 2) finalGeom = cps.map((c) => ({ lat: c.lat, lng: c.lng }))
    // T-582: die aktuellen Kontrollpunkte als exakte Wegpunkte mitspeichern → der nächste Edit zeigt
    // wieder genau diese Start/Ziel/Via-Punkte (kein erneutes Snappen/Driften aus den Geometrie-Enden).
    const finalWps = cps.map((c) => ({ lat: c.lat, lng: c.lng }))
    updateRoute(projectId, route.id, {
      name: name.trim() || route.name,
      points: finalGeom,
      ...(finalWps.length >= 2 ? { waypoints: finalWps } : {}),
      // Prüfen-Gate (T-593): Speichern im Prüf-Modus gibt die VEMAGS-Strecke frei → normale Buttons.
      ...(verificationMode ? { verifiziert: true } : {}),
    })
    runAnalysis(projectId)
    toast.success(verificationMode ? "Strecke geprüft & freigegeben. Auswertung läuft." : "Strecke gespeichert. Auswertung läuft neu.")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className={cn(
        "relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-white shadow-overlay",
        verificationMode ? "border-severity-kritisch" : "border-neutral-200",
      )}>
        {/* Prüfen-Gate (T-593): roter Hinweis, dass diese VEMAGS-Strecke geprüft & freigegeben werden muss. */}
        {verificationMode ? (
          <div className="flex items-center gap-2 border-b border-severity-kritisch/30 bg-severity-kritisch-bg px-4 py-2 text-xs font-medium text-severity-kritisch">
            <Flag className="h-3.5 w-3.5 shrink-0" />
            VEMAGS-Prüfung: Bescheide variieren in Qualität — fehlende/falsche Punkte sauber ziehen, dann gibt „Prüfung abschließen" die Strecke frei.
          </div>
        ) : null}
        {/* Kopf: Name + Aktionen */}
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="flex-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Streckenname
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 max-w-md"
              placeholder={route.name}
            />
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              routingFailed ? "bg-severity-kritisch/10 text-severity-kritisch" : "bg-neutral-100 text-neutral-600",
            )}
            title={routingFailed ? "Routing nicht verfügbar — angezeigte Linie ist nur eine Luftlinie" : undefined}
          >
            {routing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />
            ) : routingFailed ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Route className="h-3.5 w-3.5 text-neutral-400" />
            )}
            {routingFailed ? "Luftlinie" : `${distanzKm.toLocaleString("de-DE")} km`}
          </span>
          <Button variant="ghost" onClick={reset} title="Ursprünglichen Verlauf wiederherstellen">
            <RotateCcw className="mr-1 h-4 w-4" /> Original
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Abbrechen
          </Button>
          <Button
            onClick={save}
            loading={routing}
            disabled={routingFailed}
            title={routingFailed ? "Speichern blockiert: Routing nicht verfügbar" : undefined}
            className={verificationMode ? "bg-severity-kritisch text-white hover:bg-severity-kritisch/90" : undefined}
          >
            {verificationMode ? (
              <><Flag className="mr-1 h-4 w-4" /> Prüfung abschließen</>
            ) : (
              <><Save className="mr-1 h-4 w-4" /> Speichern</>
            )}
          </Button>
        </div>

        {/* dezente Bedien-Hilfe */}
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/60 px-4 py-1.5 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2563eb]" /> Punkt ziehen verschiebt</span>
          <span className="text-neutral-300">·</span>
          <span>Ein Klick auf einen Punkt entfernt ihn</span>
          <span className="text-neutral-300">·</span>
          <span>Linie greifen setzt einen neuen Punkt</span>
        </div>

        {/* Karte */}
        <div className="relative flex-1">
          <MapContainer ref={mapRef} className="h-full w-full" center={[51.2, 10.4]} zoom={6} zoomControl>
            <TileLayer key={tiles.url} attribution={tiles.attribution} url={tiles.url} />
            {tiles.overlays?.map((u) => (
              <TileLayer key={u} url={u} zIndex={2} />
            ))}
            <MapLayers />
            <FitOnce points={initialPoints.current} />
            {geometry.length >= 2 ? (
              <>
                {/* weiße Kontur unter der Strecke (sophisticated, wie Hauptkarte) */}
                <Polyline positions={geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#fff", weight: 9, opacity: 0.95 }} smoothFactor={0} interactive={false} />
                {/* sichtbare Linie */}
                <Polyline positions={geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: verificationMode ? "#dc2626" : route.farbe, weight: 5 }} smoothFactor={0} interactive={false} />
                {/* breite, durchsichtige Greif-Linie — Gummiband an beliebiger Stelle */}
                <Polyline
                  positions={geometry.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: "#000", weight: 22, opacity: 0, className: "cursor-grab" }}
                  smoothFactor={0}
                  eventHandlers={{ mousedown: onLineGrab }}
                />
              </>
            ) : null}
            {/* Punkte: greifen+ziehen zum Verschieben, reiner Klick entfernt (eigener Pointer-
                Handler statt Leaflet-Marker-Drag → kein React-Reposition-Konflikt). */}
            {cps.map((c, i) => {
              const kind = i === 0 ? "start" : i === cps.length - 1 ? "end" : "via"
              return (
                <Marker
                  key={i}
                  position={[c.lat, c.lng]}
                  icon={cpIcon(kind)}
                  zIndexOffset={kind === "via" ? 0 : 1000}
                  eventHandlers={{ mousedown: onPointGrab(i) }}
                />
              )
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
