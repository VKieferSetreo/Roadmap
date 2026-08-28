// Strecken-Editor (T-197). Zentrierte Maske (Rest abgedunkelt) aus "Bearbeiten" einer Strecke:
//  • oben Name editierbar, darunter die echte Strecke mit VIELEN dichten Stützpunkten.
//  • GUMMIBAND: Strecke an beliebiger Stelle greifen → der nächste bestehende Punkt zieht
//    mit dem Cursor mit (es wird KEIN neuer Punkt gesetzt); OSRM rechnet live neu (debounced).
//  • SPERRZONEN (T-647): Kreise auf der Karte, um die die Strecke herumgeführt wird.
//  • „Original" stellt den ursprünglichen Verlauf wieder her. Speichern → Auswertung läuft neu.
// Der Export (Datei/Google-Link) ist aus route.points abgeleitet → bleibt nach Save konsistent.
import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { Circle, MapContainer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { AlertTriangle, Ban, Check, Flag, Loader2, Route, RotateCcw, Save, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Kacheln } from "@/components/map/Kacheln"
import { MapLayers } from "@/components/map/MapControls"
import { useProjectStore } from "@/store/projects"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { api, type MeideZone, type MeideZoneStatus } from "@/api/roadmap"
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

// T-643: Wegpunkte tragen sichtbare Nummern und werden EXAKT in dieser Reihenfolge angefahren.
// Die frühere Cheapest-Insertion-Umsortierung (T-#10) ist bewusst raus: Bei Schwertransporten sind
// „unlogische" Umwege oft gewollt (Auflagen, gesperrte Brücken) — eine automatische „optimale"
// Reihenfolge zerstörte genau diese Absicht. Wer die Reihenfolge ändern will, setzt den Punkt an
// der gewünschten Etappe neu (Linie im Ziel-Segment greifen).
const cpIcon = (kind: "start" | "end" | "via", nr?: number) => {
  if (kind === "via") {
    return L.divIcon({
      className: "rm-handle",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);background:#2563eb;color:#fff;font:700 10px/1 Inter,system-ui,sans-serif">${nr ?? ""}</div>`,
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

// T-647: SPERRZONEN. Serverseitig macht die Umfahrung dieselbe Engine, die auch der KI-Agent
// nutzt (meide[] an POST /api/route/startziel) — hier wird sie nur bedienbar gemacht, sonst
// nirgends (Max 2026-08-09: „Sperrzonen ok aber NUR im Strecken edit maske"). Die Zonen sind
// Werkzeug für DIESEN Edit und werden nicht mitgespeichert; was bleibt, ist die daraus
// entstandene Geometrie samt der vom Server gesetzten Umfahrungs-Wegpunkte.
const ZONE_RADIUS_KM = 3 // Standard beim Setzen
const ZONE_RADIEN_KM = [1, 2, 3, 4, 5, 6, 7, 8] // 8 ist Server-Deckel (parseMeide)
const ZONEN_MAX = 8 // darüber schneidet der Server ab — lieber vorher sagen als still verlieren

interface Sperrzone extends MeideZone {
  id: string
}

/** Eine geroutete Etappe samt Zonen-Verdikt (Leg-Cache-Eintrag). */
interface Etappe {
  points: RoutePoint[]
  waypoints: RoutePoint[] | null
  status: MeideZoneStatus[] | null
}

/** Wegpunkt als „lat,lng" — reine Koordinaten übernimmt der Geocoder unverändert, die Etappe
 *  läuft damit über /route/startziel (nur dort hängt die Umfahrungs-Engine) ohne Geocoding. */
const koord = (p: RoutePoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

/** Im Sperrzonen-Modus setzt ein Karten-Klick eine Zone. */
function ZoneClick({ onSet }: { onSet: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onSet(e.latlng.lat, e.latlng.lng) })
  return null
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

  const [name, setName] = useState("")
  const [cps, setCps] = useState<RoutePoint[]>([])
  const [geometry, setGeometry] = useState<RoutePoint[]>([])
  const [routing, setRouting] = useState(false)
  const [routingFailed, setRoutingFailed] = useState(false)
  const [touched, setTouched] = useState(false)
  const [zonen, setZonen] = useState<Sperrzone[]>([])
  const [zoneModus, setZoneModus] = useState(false)
  // Verdikt je Zone (nach Zonen-ID). Bei jeder Zonen-Änderung geleert — ein altes „wird umfahren"
  // zu einer inzwischen anderen Zonenlage wäre eine Falschaussage.
  const [zoneStatus, setZoneStatus] = useState<Record<string, MeideZoneStatus>>({})
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
    setZonen([])
    setZoneModus(false)
    setZoneStatus({})
    initialPoints.current = route.points
    initialCps.current = cps0
  }, [open, route])

  const coordKey = cps.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join(";")
  const zonenKey = zonen.map((z) => `${koord(z)}@${z.radiusKm}`).join(";")

  // T-643: ETAPPENWEISES Routing — je Wegpunkt-Paar (n → n+1) eine eigene optimale Teilstrecke,
  // NICHT ein Gesamt-Request über alle Punkte. So bestimmt allein die Nummern-Reihenfolge den
  // Verlauf (kein Richtungswechsel/Glätten über Vias hinweg), und beim Ziehen/Einfügen/Löschen
  // eines Punkts werden nur die berührten Etappen neu gerechnet — alle anderen bleiben IDENTISCH
  // (Leg-Cache; unveränderte Etappen zucken nicht mehr um).
  const legCache = useRef(new Map<string, Etappe>())
  const routeLegs = async (points: RoutePoint[], sperr: Sperrzone[]): Promise<Etappe> => {
    const meide: MeideZone[] = sperr.map((z) => ({ lat: z.lat, lng: z.lng, radiusKm: z.radiusKm }))
    // Die Zonenlage gehört in den Cache-Key: dieselbe Etappe verläuft mit anderen Zonen anders.
    const zonenTeil = meide.map((z) => `${koord(z)}@${z.radiusKm}`).join("+")
    const legs = await Promise.all(
      points.slice(0, -1).map(async (a, i) => {
        const b = points[i + 1]
        const key = `${a.lat.toFixed(6)},${a.lng.toFixed(6)}|${b.lat.toFixed(6)},${b.lng.toFixed(6)}#${zonenTeil}`
        const cached = legCache.current.get(key)
        if (cached) return cached
        // T-647: ohne Zonen bleibt der schlanke Wegpunkt-Pfad unverändert; mit Zonen läuft dieselbe
        // Etappe über /route/startziel, weil nur dort die Umfahrungs-Engine hängt. Beide Wege enden
        // in routeWaypoints → identische Geometrie, gleicher Server-Cache.
        const res = meide.length
          ? await api.route.startziel(koord(a), koord(b), [], meide)
          : await api.route.waypoints([{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }])
        const leg: Etappe = { points: res.points, waypoints: res.waypoints ?? null, status: res.meideStatus ?? null }
        legCache.current.set(key, leg)
        return leg
      }),
    )
    // Etappen zusammenfügen; identischen Naht-Punkt (Ende Etappe n = Start Etappe n+1) nicht doppeln.
    const anhaengen = (ziel: RoutePoint[], p: RoutePoint) => {
      const last = ziel[ziel.length - 1]
      if (last && last.lat === p.lat && last.lng === p.lng) return
      ziel.push(p)
    }
    const out: RoutePoint[] = []
    const wps: RoutePoint[] = []
    for (const leg of legs) {
      for (const p of leg.points) anhaengen(out, p)
      for (const p of leg.waypoints ?? []) anhaengen(wps, p)
    }
    // Zonen-Verdikt über alle Etappen zusammenziehen: scheitert die Umfahrung auf EINER Etappe,
    // führt die Gesamtstrecke durch die Zone — dann darf sie nicht als umfahren gelten.
    const status: MeideZoneStatus[] = meide.map((z, zi) => {
      const jeEtappe = legs.map((l) => l.status?.[zi]).filter((s): s is MeideZoneStatus => !!s)
      const gescheitert = jeEtappe.find((s) => !s.umfahren)
      if (gescheitert) return gescheitert
      if (!jeEtappe.length) return { ...z, umfahren: false, grund: "Keine Rückmeldung vom Routing" }
      return { ...z, umfahren: true }
    })
    return { points: out, waypoints: wps, status }
  }

  /** Verdikte den Zonen zuordnen (Server antwortet in Sendereihenfolge). */
  const uebernehmeZoneStatus = (sperr: Sperrzone[], status: MeideZoneStatus[] | null) => {
    const next: Record<string, MeideZoneStatus> = {}
    sperr.forEach((z, i) => {
      const s = status?.[i]
      if (s) next[z.id] = s
    })
    setZoneStatus(next)
  }

  // Live-Routing nach jeder Bewegung (debounced). Erst nach der ersten Nutzer-Aktion, damit
  // eine unangetastet geöffnete Strecke nicht sofort neu gesnappt wird.
  useEffect(() => {
    if (!touched || cps.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setRouting(true)
      try {
        const res = await routeLegs(cps, zonen)
        if (!cancelled) {
          setGeometry(res.points)
          uebernehmeZoneStatus(zonen, res.status)
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
      // Mit Sperrzonen sucht der Server je Etappe mehrere Umfahrungen durch — länger warten,
      // damit nicht jede Zwischenposition eines Zuges eine teure Suche auslöst.
    }, zonen.length ? 700 : 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordKey, zonenKey, touched])

  const distanzKm = useMemo(() => routeLengthKm(geometry), [geometry])
  // T-600: nur endliche Punkte an die Polylines geben — ein NaN-Punkt vergiftet Leaflets
  // Zoom-Recalc und lässt die blauen Wegpunkt-Marker beim Zoomen/Greifen verschwinden.
  const geomLatLng = useMemo(
    () =>
      geometry
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]),
    [geometry],
  )

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

  const addZone = (lat: number, lng: number) => {
    if (zonen.length >= ZONEN_MAX) {
      toast.error(`Höchstens ${ZONEN_MAX} Sperrzonen.`)
      return
    }
    // Radius der zuletzt gesetzten Zone weiterverwenden — mehrere Zonen sind meist gleich groß.
    const radiusKm = zonen[zonen.length - 1]?.radiusKm ?? ZONE_RADIUS_KM
    setZonen((prev) => [...prev, { id: crypto.randomUUID(), lat, lng, radiusKm }])
    setZoneStatus({})
    setTouched(true)
  }

  const removeZone = (id: string) => {
    setZonen((prev) => prev.filter((z) => z.id !== id))
    setZoneStatus({})
    setTouched(true)
  }

  const setZoneRadius = (id: string, radiusKm: number) => {
    setZonen((prev) => prev.map((z) => (z.id === id ? { ...z, radiusKm } : z)))
    setZoneStatus({})
    setTouched(true)
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
        // T-643: gezogen → Nummer/Position in der Reihenfolge bleibt EXAKT erhalten (kein Auto-Umsortieren)
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
      // T-643: der neue Punkt behält seine Etappen-Position (Nummer = gegriffenes Segment)
    )
  }

  const reset = () => {
    setCps(initialCps.current)
    setGeometry(initialPoints.current)
    setTouched(false)
    setRoutingFailed(false)
    failToastRef.current = false
    setZonen([])
    setZoneStatus({})
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
    // T-582: die aktuellen Kontrollpunkte als exakte Wegpunkte mitspeichern → der nächste Edit zeigt
    // wieder genau diese Start/Ziel/Via-Punkte (kein erneutes Snappen/Driften aus den Geometrie-Enden).
    let finalWps = cps.map((c) => ({ lat: c.lat, lng: c.lng }))
    if (touched && cps.length >= 2) {
      setRouting(true)
      try {
        // T-643: identischer Etappen-Pfad wie das Live-Routing (Leg-Cache) — gespeichert wird
        // exakt, was angezeigt wird; unveränderte Etappen kommen aus dem Cache.
        const { points, waypoints, status } = await routeLegs(cps, zonen)
        finalGeom = points
        setGeometry(points)
        uebernehmeZoneStatus(zonen, status)
        // T-647: mit Sperrzonen setzt der Server eigene Umfahrungs-Punkte in die Etappen. Die als
        // Wegpunkte übernehmen, sonst routet der nächste Edit wieder mitten durch die Zone — die
        // Zonen selbst leben nur in dieser Maske. Ohne Zonen liefert /route/waypoints keine
        // Wegpunkte → es bleibt bei den Kontrollpunkten.
        if (waypoints && waypoints.length >= 2) finalWps = waypoints
        // Nicht umfahrbare Zonen beim Speichern benennen, statt eine Strecke stillschweigend
        // freizugeben, die weiterhin durch eine gesperrte Fläche läuft.
        const offen = (status ?? []).filter((s) => !s.umfahren).length
        if (offen) {
          toast.warning(
            offen === 1
              ? "Eine Sperrzone konnte nicht umfahren werden — die Strecke verläuft weiterhin hindurch."
              : `${offen} Sperrzonen konnten nicht umfahren werden — die Strecke verläuft weiterhin hindurch.`,
          )
        }
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
          <span>Linie greifen setzt einen neuen Punkt in der Etappe</span>
          <span className="text-neutral-300">·</span>
          <span className="font-medium text-neutral-600">Anfahrt strikt in Nummern-Reihenfolge, Etappe für Etappe</span>
          {/* T-647: Zonen-Modus. Solange er läuft, sind Linie und Punkte nicht greifbar — sonst
              setzt ein Klick auf die Strecke einen Wegpunkt statt einer Zone. */}
          <button
            type="button"
            onClick={() => setZoneModus((v) => !v)}
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium transition-colors",
              zoneModus
                ? "border-severity-kritisch bg-severity-kritisch-bg text-severity-kritisch"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100",
            )}
            title="Bereiche markieren, die die Strecke meiden soll"
          >
            <Ban className="h-3 w-3" />
            {zoneModus ? "Sperrzone: auf die Karte klicken" : "Sperrzone"}
          </button>
        </div>

        {/* Karte */}
        <div className="relative flex-1">
          <MapContainer ref={mapRef} className="h-full w-full" center={[51.2, 10.4]} zoom={6} zoomControl>
            <Kacheln />
            <MapLayers />
            <FitOnce points={initialPoints.current} />
            {geomLatLng.length >= 2 ? (
              <>
                {/* weiße Kontur unter der Strecke (sophisticated, wie Hauptkarte) */}
                <Polyline positions={geomLatLng} pathOptions={{ color: "#fff", weight: 9, opacity: 0.95 }} smoothFactor={0} interactive={false} />
                {/* sichtbare Linie */}
                <Polyline positions={geomLatLng} pathOptions={{ color: verificationMode ? "#dc2626" : route.farbe, weight: 5 }} smoothFactor={0} interactive={false} />
                {/* breite, durchsichtige Greif-Linie — Gummiband an beliebiger Stelle */}
                {!zoneModus ? (
                  <Polyline
                    positions={geomLatLng}
                    pathOptions={{ color: "#000", weight: 22, opacity: 0, className: "cursor-grab" }}
                    smoothFactor={0}
                    eventHandlers={{ mousedown: onLineGrab }}
                  />
                ) : null}
              </>
            ) : null}
            {zoneModus ? <ZoneClick onSet={addZone} /> : null}
            {/* Sperrzonen: rot, sobald die Umfahrung gescheitert ist — die Strecke läuft dann
                weiterhin hindurch und das muss auf der Karte sichtbar sein. Nicht anklickbar,
                damit der Klick durch die Fläche hindurch die nächste Zone setzen kann. */}
            {zonen.map((z) => {
              const st = zoneStatus[z.id]
              const gescheitert = st ? !st.umfahren : false
              return (
                <Circle
                  key={z.id}
                  center={[z.lat, z.lng]}
                  radius={z.radiusKm * 1000}
                  interactive={false}
                  pathOptions={
                    gescheitert
                      ? { color: "#DC2626", weight: 2, fillColor: "#DC2626", fillOpacity: 0.18 }
                      : { color: "#525252", weight: 2, dashArray: "6 4", fillColor: "#525252", fillOpacity: 0.1 }
                  }
                />
              )
            })}
            {/* Punkte: greifen+ziehen zum Verschieben, reiner Klick entfernt (eigener Pointer-
                Handler statt Leaflet-Marker-Drag → kein React-Reposition-Konflikt). */}
            {cps.map((c, i) => {
              // T-600: kein Marker für nicht-endliche Koordinaten (bricht sonst Leaflets Zoom-Recalc).
              // Index i bleibt unverändert → Drag-/Lösch-Handler (onPointGrab(i)) zeigen weiter richtig.
              if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null
              const kind = i === 0 ? "start" : i === cps.length - 1 ? "end" : "via"
              return (
                <Marker
                  key={i}
                  position={[c.lat, c.lng]}
                  // T-643: Vias tragen ihre Anfahr-Nummer (1..n zwischen S und Z) sichtbar im Pin
                  icon={cpIcon(kind, i)}
                  zIndexOffset={kind === "via" ? 0 : 1000}
                  eventHandlers={zoneModus ? undefined : { mousedown: onPointGrab(i) }}
                />
              )
            })}
          </MapContainer>

          {/* T-647: Zonen-Liste mit Verdikt je Zone. */}
          {zoneModus || zonen.length ? (
            <div className="absolute right-3 top-3 z-[1000] w-64 rounded-lg border border-neutral-200 bg-white/95 p-2.5 shadow-overlay">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <Ban className="h-3.5 w-3.5 text-severity-kritisch" />
                Sperrzonen
                <span className="ml-auto font-normal tabular-nums text-neutral-400">
                  {zonen.length}/{ZONEN_MAX}
                </span>
              </div>
              {zonen.length === 0 ? (
                <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
                  Klick auf die Karte setzt eine Zone. Die Strecke wird außen herum geführt.
                </p>
              ) : (
                <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
                  {zonen.map((z, i) => {
                    const st = zoneStatus[z.id]
                    return (
                      <li
                        key={z.id}
                        className={cn(
                          "rounded-md border px-2 py-1.5",
                          st && !st.umfahren
                            ? "border-severity-kritisch-border bg-severity-kritisch-bg"
                            : "border-neutral-200 bg-neutral-50",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-neutral-700">Zone {i + 1}</span>
                          <select
                            value={z.radiusKm}
                            onChange={(e) => setZoneRadius(z.id, Number(e.target.value))}
                            className="h-5 rounded border border-neutral-300 bg-white px-1 text-[11px] text-neutral-700"
                            title="Radius der Zone"
                          >
                            {ZONE_RADIEN_KM.map((r) => (
                              <option key={r} value={r}>
                                {r} km
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeZone(z.id)}
                            className="ml-auto rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                            aria-label={`Zone ${i + 1} entfernen`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug">
                          {!st ? (
                            // Kein Verdikt = Prüfung läuft noch (Debounce/Routing). Bewusst nicht „ok"
                            // vorwegnehmen — der Nutzer soll die Zone erst grün sehen, wenn sie es ist.
                            <span className="text-neutral-400">
                              {routingFailed ? "Routing nicht verfügbar" : "wird geprüft …"}
                            </span>
                          ) : st.umfahren ? (
                            <>
                              <Check className="mt-px h-3 w-3 shrink-0 text-primary-600" />
                              <span className="text-neutral-500">Strecke meidet die Zone</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-severity-kritisch" />
                              <span className="text-severity-kritisch-text">
                                {st.grund ?? "Keine Umfahrung gefunden — Strecke läuft weiterhin hindurch."}
                              </span>
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
