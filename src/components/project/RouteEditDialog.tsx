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
import { Loader2, RotateCcw, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { useProjectStore } from "@/store/projects"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { api } from "@/api/roadmap"
import type { ProjectRoute, RoutePoint } from "@/types/domain"

// Aus der Geometrie gleichmäßig verteilte Stützpunkte ableiten (Start + Ziel immer dabei).
// Moderate Anfangsdichte; der Nutzer darf danach beliebig viele Punkte setzen (kein Limit).
function deriveControlPoints(points: RoutePoint[]): RoutePoint[] {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length <= 2) return pts.map((p) => ({ lat: p.lat, lng: p.lng }))
  const want = Math.min(pts.length, Math.max(8, Math.round(pts.length / 20)))
  const out: RoutePoint[] = []
  for (let i = 0; i < want; i++) {
    const idx = Math.round((i / (want - 1)) * (pts.length - 1))
    out.push({ lat: pts[idx].lat, lng: pts[idx].lng })
  }
  return out
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

const cpIcon = (isEnd: boolean) =>
  L.divIcon({
    className: "",
    iconSize: isEnd ? [16, 16] : [11, 11],
    iconAnchor: isEnd ? [8, 8] : [6, 6],
    html: `<div style="width:100%;height:100%;border-radius:9999px;border:2px solid #fff;
      box-shadow:0 1px 2px rgba(0,0,0,.4);background:${isEnd ? "#16a34a" : "#2563eb"}"></div>`,
  })

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
}

export function RouteEditDialog({ open, onClose, projectId, route }: RouteEditDialogProps) {
  const updateRoute = useProjectStore((s) => s.updateRoute)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  const [name, setName] = useState("")
  const [cps, setCps] = useState<RoutePoint[]>([])
  const [geometry, setGeometry] = useState<RoutePoint[]>([])
  const [routing, setRouting] = useState(false)
  const [touched, setTouched] = useState(false)
  const initialPoints = useRef<RoutePoint[]>([])
  const mapRef = useRef<L.Map | null>(null)
  const dragIdxRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open || !route) return
    setName(route.name)
    setCps(deriveControlPoints(route.points))
    setGeometry(route.points)
    setTouched(false)
    initialPoints.current = route.points
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
        if (!cancelled) setGeometry(res.points)
      } catch {
        if (!cancelled) setGeometry(cps.map((c) => ({ lat: c.lat, lng: c.lng })))
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

  // Drag-Mechanik: Karten-Pan aus, Bewegung verfolgen, am Ende aufräumen.
  const startDrag = (onMove: (ev: L.LeafletMouseEvent) => void, onEnd?: () => void) => {
    const map = mapRef.current
    if (!map) return
    map.dragging.disable()
    const up = () => {
      map.off("mousemove", onMove)
      map.off("mouseup", up)
      window.removeEventListener("mouseup", up)
      map.dragging.enable()
      dragIdxRef.current = null
      onEnd?.()
    }
    map.on("mousemove", onMove)
    map.on("mouseup", up)
    window.addEventListener("mouseup", up)
  }

  // Bestehenden Punkt anfassen: ziehen (Bewegung) ODER bei reinem Klick löschen.
  const onPointGrab = (i: number) => (e: L.LeafletMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    L.DomEvent.stop(e.originalEvent)
    const start = map.latLngToContainerPoint(e.latlng)
    let moved = false
    startDrag(
      (ev) => {
        if (!moved && map.latLngToContainerPoint(ev.latlng).distanceTo(start) > 4) moved = true
        if (moved) moveCp(i, ev.latlng.lat, ev.latlng.lng)
      },
      () => {
        if (!moved) removeCp(i) // Klick ohne Ziehen → entfernen
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
    startDrag((ev) => {
      if (dragIdxRef.current == null) return
      moveCp(dragIdxRef.current, ev.latlng.lat, ev.latlng.lng)
    })
  }

  const reset = () => {
    setCps(deriveControlPoints(initialPoints.current))
    setGeometry(initialPoints.current)
    setTouched(false)
  }

  const save = () => {
    const finalGeom = geometry.length >= 2 ? geometry : cps.map((c) => ({ lat: c.lat, lng: c.lng }))
    updateRoute(projectId, route.id, { name: name.trim() || route.name, points: finalGeom })
    runAnalysis(projectId)
    toast.success("Strecke gespeichert — Auswertung läuft neu.")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-overlay">
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
          <span className="flex items-center gap-1.5 text-sm tabular-nums text-neutral-500">
            {routing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {distanzKm.toLocaleString("de-DE")} km
          </span>
          <Button variant="ghost" onClick={reset} title="Ursprünglichen Verlauf wiederherstellen">
            <RotateCcw className="mr-1 h-4 w-4" /> Original
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Abbrechen
          </Button>
          <Button onClick={save}>
            <Save className="mr-1 h-4 w-4" /> Speichern
          </Button>
        </div>

        {/* Karte */}
        <div className="relative flex-1">
          <MapContainer ref={mapRef} className="h-full w-full" center={[51.2, 10.4]} zoom={6} zoomControl>
            <TileLayer key={tiles.url} attribution={tiles.attribution} url={tiles.url} />
            <FitOnce points={initialPoints.current} />
            {geometry.length >= 2 ? (
              <>
                {/* sichtbare Linie */}
                <Polyline positions={geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: route.farbe, weight: 5 }} smoothFactor={0} interactive={false} />
                {/* breite, durchsichtige Greif-Linie — Gummiband an beliebiger Stelle */}
                <Polyline
                  positions={geometry.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: "#000", weight: 20, opacity: 0, className: "cursor-grab" }}
                  smoothFactor={0}
                  eventHandlers={{ mousedown: onLineGrab }}
                />
              </>
            ) : null}
            {/* Punkte: greifen+ziehen zum Verschieben, reiner Klick entfernt (eigener Pointer-
                Handler statt Leaflet-Marker-Drag → kein React-Reposition-Konflikt). */}
            {cps.map((c, i) => {
              const isEnd = i === 0 || i === cps.length - 1
              return (
                <Marker
                  key={i}
                  position={[c.lat, c.lng]}
                  icon={cpIcon(isEnd)}
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
