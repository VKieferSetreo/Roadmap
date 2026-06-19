// Strecken-Editor (T-197). Zentrierte Maske (Rest abgedunkelt) aus "Bearbeiten" einer Strecke:
//  • oben Name editierbar, darunter die echte Strecke auf der Karte mit Wegpunkten
//  • GUMMIBAND: beliebigen Punkt der Linie greifen und ziehen → an der Stelle entsteht ein
//    Wegpunkt, der live mitzieht; OSRM rechnet den Straßenweg neu (debounced).
//  • Wegpunkte fixieren (Pin = vor Verschieben/Löschen geschützt, MUSS durchfahren werden)
//  • Klick auf die Karte fügt einen Wegpunkt ein; Speichern → Auswertung läuft neu.
// Der Export (Datei/Google-Link) ist aus route.points abgeleitet → bleibt nach Save konsistent.
import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Loader2, Lock, LockOpen, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { useProjectStore } from "@/store/projects"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { api } from "@/api/roadmap"
import type { ProjectRoute, RoutePoint } from "@/types/domain"
import { cn } from "@/lib/cn"

interface ControlPoint extends RoutePoint {
  pinned: boolean
}

// ponytail: max. 8 Kontrollpunkte — hält OSRM schnell und die Karte übersichtlich.
// Wir speichern keine Original-Wegpunkte (Route-Schema hat nur points), darum beim Öffnen
// aus der Geometrie ableiten: Start, Ziel + gleichmäßig verteilte Zwischenpunkte.
// Start mit wenigen Stützpunkten (Original-Verlauf annähern); der Nutzer darf bis MAX_CP
// eigene Wegpunkte per Karten-/Streckenklick ergänzen.
const INIT_CP = 8
const MAX_CP = 25

function deriveControlPoints(points: RoutePoint[]): ControlPoint[] {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length <= 2) return pts.map((p) => ({ ...p, pinned: false }))
  const inner = INIT_CP - 2
  const step = (pts.length - 1) / (inner + 1)
  const out: ControlPoint[] = [{ ...pts[0], pinned: false }]
  for (let i = 1; i <= inner; i++) out.push({ ...pts[Math.round(i * step)], pinned: false })
  out.push({ ...pts[pts.length - 1], pinned: false })
  return out
}

/** Einfügeindex im Segment, dessen Mittelpunkt dem Punkt p am nächsten liegt. */
function bestInsertIndex(cps: ControlPoint[], p: RoutePoint): number {
  if (cps.length < 2) return cps.length
  let bestIdx = 1
  let bestD = Infinity
  for (let i = 0; i < cps.length - 1; i++) {
    const mx = (cps[i].lat + cps[i + 1].lat) / 2
    const my = (cps[i].lng + cps[i + 1].lng) / 2
    const d = (mx - p.lat) ** 2 + (my - p.lng) ** 2
    if (d < bestD) {
      bestD = d
      bestIdx = i + 1
    }
  }
  return bestIdx
}

const cpIcon = (pinned: boolean, isEnd: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="width:18px;height:18px;border-radius:9999px;border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,.4);background:${
        pinned ? "#dc2626" : isEnd ? "#16a34a" : "#2563eb"
      }"></div>`,
  })

/** Karte beim Öffnen auf die Strecke zoomen. */
function FitOnce({ points }: { points: RoutePoint[] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length < 2) return
    done.current = true
    // In der Maske ist die Karte erst nach Layout korrekt vermessen.
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

/** Klick auf die Karte → neuen Wegpunkt im passenden Segment einfügen. */
function ClickToAdd({ onAdd }: { onAdd: (p: RoutePoint) => void }) {
  useMapEvents({ click: (e) => onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) })
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
  const [cps, setCps] = useState<ControlPoint[]>([])
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

  // Nur Koordinaten triggern Re-Routing — Pin-Toggle (gleiche Koordinaten) nicht.
  const coordKey = cps.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join(";")

  // Live-Routing nach jeder Wegpunkt-Bewegung (debounced). Erst nach erster Nutzer-Aktion,
  // damit eine unangetastet geöffnete (z.B. Datei-)Strecke nicht sofort neu gesnappt wird.
  useEffect(() => {
    if (!touched || cps.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setRouting(true)
      try {
        const res = await api.route.waypoints(cps.map((c) => ({ lat: c.lat, lng: c.lng })))
        if (!cancelled) setGeometry(res.points)
      } catch {
        // OSRM aus / Demo → gerade Verbindungslinien zwischen den Wegpunkten.
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

  const moveCp = (i: number, latlng: L.LatLng) => {
    setCps((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, lat: latlng.lat, lng: latlng.lng } : c)),
    )
    setTouched(true)
  }

  const togglePin = (i: number) =>
    setCps((prev) => prev.map((c, idx) => (idx === i ? { ...c, pinned: !c.pinned } : c)))

  const removeCp = (i: number) => {
    setCps((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))
    setTouched(true)
  }

  // Neuen Wegpunkt im Segment einfügen, dessen Mittelpunkt dem Klick am nächsten liegt.
  const addCp = (p: RoutePoint) => {
    if (cps.length >= MAX_CP) {
      toast.error(`Maximal ${MAX_CP} Wegpunkte.`)
      return
    }
    setCps((prev) => {
      if (prev.length < 2) return [...prev, { ...p, pinned: false }]
      const next = [...prev]
      next.splice(bestInsertIndex(prev, p), 0, { ...p, pinned: false })
      return next
    })
    setTouched(true)
  }

  // GUMMIBAND: an beliebiger Stelle der Linie greifen → dort Wegpunkt einfügen und live
  // mit dem Cursor ziehen. Karte-Pan währenddessen aus; OSRM rechnet (debounced) neu.
  const onLineGrab = (e: L.LeafletMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    if (cps.length >= MAX_CP) {
      toast.error(`Maximal ${MAX_CP} Wegpunkte.`)
      return
    }
    L.DomEvent.stop(e.originalEvent)
    map.dragging.disable()
    const p = { lat: e.latlng.lat, lng: e.latlng.lng }
    const idx = bestInsertIndex(cps, p)
    dragIdxRef.current = idx
    setCps((prev) => {
      const next = [...prev]
      next.splice(idx, 0, { ...p, pinned: false })
      return next
    })
    setTouched(true)
    const onMove = (ev: L.LeafletMouseEvent) => {
      const di = dragIdxRef.current
      if (di == null) return
      setCps((prev) =>
        prev.map((c, i) => (i === di ? { ...c, lat: ev.latlng.lat, lng: ev.latlng.lng } : c)),
      )
    }
    const onUp = () => {
      map.off("mousemove", onMove)
      map.off("mouseup", onUp)
      window.removeEventListener("mouseup", onUp)
      map.dragging.enable()
      dragIdxRef.current = null
    }
    map.on("mousemove", onMove)
    map.on("mouseup", onUp)
    window.addEventListener("mouseup", onUp) // Fallback, falls außerhalb der Karte losgelassen
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
      {/* abgedunkelter Rest — Klick schließt */}
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* zentrierte Maske */}
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
        <Button variant="ghost" onClick={onClose}>
          <X className="mr-1 h-4 w-4" /> Abbrechen
        </Button>
        <Button onClick={save}>
          <Save className="mr-1 h-4 w-4" /> Speichern
        </Button>
      </div>

      {/* Karte + Wegpunkt-Liste */}
      <div className="relative flex-1">
        <MapContainer ref={mapRef} className="h-full w-full" center={[51.2, 10.4]} zoom={6} zoomControl>
          <TileLayer key={tiles.url} attribution={tiles.attribution} url={tiles.url} />
          <FitOnce points={initialPoints.current} />
          <ClickToAdd onAdd={addCp} />
          {geometry.length >= 2 ? (
            <>
              {/* sichtbare Linie (nicht interaktiv) */}
              <Polyline positions={geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: route.farbe, weight: 5 }} smoothFactor={0} interactive={false} />
              {/* breite, durchsichtige Greif-Linie fürs Gummiband (mousedown = ziehen) */}
              <Polyline
                positions={geometry.map((p) => [p.lat, p.lng])}
                pathOptions={{ color: "#000", weight: 18, opacity: 0, className: "cursor-grab" }}
                smoothFactor={0}
                eventHandlers={{ mousedown: onLineGrab }}
              />
            </>
          ) : null}
          {cps.map((c, i) => {
            const isEnd = i === 0 || i === cps.length - 1
            return (
              <Marker
                key={i}
                position={[c.lat, c.lng]}
                icon={cpIcon(c.pinned, isEnd)}
                draggable={!c.pinned}
                eventHandlers={{ dragend: (e) => moveCp(i, (e.target as L.Marker).getLatLng()) }}
              />
            )
          })}
        </MapContainer>

        {/* Wegpunkt-Liste: fixieren / löschen */}
        <div className="absolute right-3 top-3 z-[1100] w-56 rounded-lg border border-neutral-200 bg-white/95 shadow-overlay backdrop-blur">
          <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">
            Wegpunkte ({cps.length})
          </div>
          <ul className="max-h-[40vh] overflow-y-auto px-1.5 py-1.5">
            {cps.map((c, i) => {
              const label = i === 0 ? "Start" : i === cps.length - 1 ? "Ziel" : `Wegpunkt ${i}`
              return (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-neutral-100/70"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-neutral-700">
                    {c.pinned ? "📌 " : ""}
                    {label}
                  </span>
                  <button
                    onClick={() => togglePin(i)}
                    title={c.pinned ? "Fixierung lösen" : "Wegpunkt fixieren (Pflicht)"}
                    className={cn(
                      "rounded p-1 hover:bg-neutral-200/70",
                      c.pinned ? "text-red-600" : "text-neutral-400",
                    )}
                  >
                    {c.pinned ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => removeCp(i)}
                    disabled={c.pinned || cps.length <= 2}
                    title="Wegpunkt löschen"
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-200/70 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-neutral-200 px-3 py-2 text-[11px] leading-snug text-neutral-400">
            Linie an beliebiger Stelle greifen und ziehen — der Punkt zieht mit (Gummiband).
            Klick auf die Karte fügt einen Wegpunkt ein.
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
