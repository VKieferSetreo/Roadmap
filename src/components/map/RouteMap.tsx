// Leaflet-Karte mit Route-Polyline + Form+Farb-codierten Fund-Markern.
// Form = Kategorie-Gruppe (Bauwerk, Physik, Baustelle, Verkehr), Farbe = Severity.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Locate, Maximize2, Minimize2, Minus, Plus, TriangleAlert } from "lucide-react"
import type { Finding, ProjectRoute, RoutePoint } from "@/types/domain"
import { EIGEN_COLOR, istEigenerEintrag, katMeta, SEVERITY_META } from "@/components/project/findingMeta"
import { FindingMarker } from "./FindingMarker"
import { LayerSwitcher } from "./MapControls"
import { MapResize } from "./MapResize"
import { directionArrowIcon, endPinIcon, startPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { groupFindings } from "@/lib/findingGroups"
import { geomToLines, sliceRouteByKm } from "@/lib/geom"
import { cn } from "@/lib/cn"

const GERMANY: [number, number] = [51.1657, 10.4515]

/** Bildschirm-Winkel (°) eines Segments a→b: 0° = nach rechts (Osten), −90° = nach oben (Norden).
 *  lng um cos(lat) gestaucht (DE-Verzerrung), Bildschirm-y zeigt nach unten → −dLat. */
function segmentAngle(a: [number, number], b: [number, number]): number {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  return (Math.atan2(-(b[0] - a[0]), (b[1] - a[1]) * k) * 180) / Math.PI
}

/** Dezente Fahrtrichtungs-Pfeile gleichmäßig entlang der Strecke (Index-basiert, nie an Start/Ziel).
 *  Anzahl skaliert mit der Punktdichte (6…24) — dichter als zuvor (Max 2026-06-21: „mehr"). */
function routeArrows(positions: [number, number][]): { pos: [number, number]; angle: number }[] {
  const len = positions.length
  if (len < 2) return []
  const n = Math.min(24, Math.max(6, Math.round(len / 25)))
  const out: { pos: [number, number]; angle: number }[] = []
  for (let k = 1; k <= n; k++) {
    const i = Math.min(len - 2, Math.max(0, Math.round((k / (n + 1)) * (len - 1))))
    out.push({ pos: positions[i], angle: segmentAngle(positions[i], positions[i + 1]) })
  }
  return out
}

/** Passt den Kartenausschnitt an die Strecke an, sobald sie sich ändert. */
function FitBounds({ points, enabled }: { points: RoutePoint[]; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled || points.length < 2) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48] })
  }, [map, points, enabled])
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 80)
    return () => clearTimeout(id)
  }, [map])
  return null
}

interface RouteMapProps {
  /** sichtbare Strecken (Caller filtert ein-/ausgeblendete Ebenen vorab). */
  routes: ProjectRoute[]
  findings: Finding[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** wenn gesetzt: ein Klick DIREKT auf eine Strecke (nicht auf einen Fund-Pin)
   *  meldet die geklickte Position — fürs Anlegen eines Eintrags. */
  onRouteClick?: (p: RoutePoint) => void
  /** wenn gesetzt: eigener Eintrag kann aus dem Popup verworfen werden (obstacleId). */
  onDeleteOwn?: (obstacleId: string) => void
  /** wenn gesetzt: Fund aus dem Popup ausblenden (nicht löschen) — für die Sichtung. */
  onHide?: (finding: Finding) => void
  /** Baustellen-Chat in den Fund-Markern anbieten (App = true, öffentliche Freigabe = false). */
  canChat?: boolean
  /** Karte auf diesen Punkt zentrieren, sobald sich `nonce` ändert (Such-Treffer-Sprung). */
  focusPoint?: { lat: number; lng: number; nonce: number } | null
  className?: string
  /** Overlays (Suche, Panels, Zeitstrahl) — liegen IM Karten-Wrapper, damit sie auch
   *  im Vollbild sichtbar bleiben (T-198). */
  children?: ReactNode
}

export function RouteMap({
  routes,
  findings,
  selectedId,
  onSelect,
  onRouteClick,
  onDeleteOwn,
  onHide,
  canChat = true,
  focusPoint,
  className,
  children,
}: RouteMapProps) {
  const tileStyle = useSettingsStore((s) => s.tileStyle)
  const autoFit = useSettingsStore((s) => s.autoFit)
  const tiles = TILE_LAYERS[tileStyle]
  const drawn = useMemo(
    () =>
      routes
        .filter((r) => r.points.length >= 2)
        .map((r) => ({
          ...r,
          positions: r.points.map((p) => [p.lat, p.lng] as [number, number]),
        })),
    [routes],
  )
  const allPoints = useMemo(() => drawn.flatMap((r) => r.points), [drawn])
  // T-377: Gruppierung (O(n²)) nur bei Funde-Änderung, nicht bei jedem Pan/Zoom-Render.
  const findingGroups = useMemo(() => groupFindings(findings), [findings])
  const mapRef = useRef<L.Map | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    const onChange = () => {
      setIsFs(Boolean(document.fullscreenElement))
      setTimeout(() => mapRef.current?.invalidateSize(), 60)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Such-Treffer: Karte auf den Fund zentrieren (mind. Zoom 14), wenn sich nonce ändert.
  useEffect(() => {
    if (!focusPoint || !mapRef.current) return
    const z = Math.max(mapRef.current.getZoom() ?? 0, 14)
    mapRef.current.setView([focusPoint.lat, focusPoint.lng], z, { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.nonce])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrapperRef.current?.requestFullscreen?.()
  }

  const centerOnRoute = () => {
    if (!mapRef.current || allPoints.length < 2) return
    mapRef.current.fitBounds(
      L.latLngBounds(allPoints.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48] },
    )
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative h-full w-full bg-neutral-100", className)}
    >
      <MapContainer
        ref={mapRef}
        center={GERMANY}
        zoom={6}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer key={tiles.url} attribution={tiles.attribution} url={tiles.url} />
        {tiles.overlays?.map((u) => (
          <TileLayer key={u} url={u} zIndex={2} />
        ))}
        <MapResize />

        {/* Strecke in ihrer Farbe — KEINE weiße Umrandung (Max 2026-06-21). */}
        {drawn.map((r) => (
          <Polyline
            key={`line-${r.id}`}
            positions={r.positions}
            smoothFactor={0}
            // T-480: grobe Schätzung (OSRM-Fallback) gestrichelt → kein echter Straßenweg vorgetäuscht.
            pathOptions={{ color: r.farbe, weight: 5, opacity: 1, ...(r.grob ? { dashArray: "10 8" } : {}) }}
          />
        ))}
        {/* Fahrtrichtung: dezente weiße Pfeile entlang der Strecke (Marker im markerPane, nicht
            klickbar). Ab >15 Strecken weggelassen — bei so vielen Linien wäre es nur noch Geflimmer
            (ponytail: Pfeil-Obergrenze ~24/Strecke, statt tausende Marker zu rendern). */}
        {drawn.length <= 15
          ? drawn.flatMap((r) =>
              routeArrows(r.positions).map((ar, idx) => (
                <Marker
                  key={`dir-${r.id}-${idx}`}
                  position={ar.pos}
                  icon={directionArrowIcon(ar.angle)}
                  interactive={false}
                  keyboard={false}
                />
              )),
            )
          : null}
        {/* Unsichtbare, breite Klick-Spur: Klick auf die Strecke → Eintrag-Maske.
            Liegt im overlayPane UNTER den Markern (markerPane) → Fund-Pins fangen
            ihre Klicks selbst ab, nur „freie" Strecken-Klicks lösen onRouteClick aus. */}
        {onRouteClick
          ? drawn.map((r) => (
              <Polyline
                key={`hit-${r.id}`}
                positions={r.positions}
                smoothFactor={0}
                pathOptions={{
                  color: "#000000",
                  weight: 20,
                  opacity: 0,
                  className: "route-hit",
                  lineCap: "round",
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    onRouteClick({ lat: e.latlng.lat, lng: e.latlng.lng })
                  },
                }}
              />
            ))
          : null}

        {drawn.map((r) => (
          <Marker key={`start-${r.id}`} position={r.positions[0]} icon={startPinIcon(r.farbe)}>
            <Popup>Start: {r.name}</Popup>
          </Marker>
        ))}
        {drawn.map((r) => (
          <Marker
            key={`end-${r.id}`}
            position={r.positions[r.positions.length - 1]}
            icon={endPinIcon(r.farbe)}
          >
            <Popup>Ziel: {r.name}</Popup>
          </Marker>
        ))}
        {allPoints.length >= 2 ? <FitBounds points={allPoints} enabled={autoFit} /> : null}

        {/* Strecke, auf der ein Fund GREIFT (geom = Linie/MultiLineString), in der
            Severity-Farbe — weißes Casing darunter + Klick wählt den Fund. So sieht man
            die betroffene Strecke, nicht nur einen Punkt. */}
        {findings.flatMap((f) => {
          let lines = geomToLines(f.geom)
          if (lines.length === 0) {
            // Kein eigenes Hindernis-geom (viele Quellen liefern nur einen Punkt) → den betroffenen
            // Routen-Abschnitt um f.km (±150 m) als Segment markieren, statt nur die Fahrbahnlinie zu zeigen.
            const route = drawn.find((r) => r.id === f.routeId)
            if (route) {
              const seg = sliceRouteByKm(route.positions, f.km - 0.15, f.km + 0.15)
              if (seg.length >= 2) lines = [seg]
            }
          }
          if (lines.length === 0) return []
          const meta = SEVERITY_META[f.severity]
          const eigen = istEigenerEintrag(f.quelle)
          const color = eigen ? EIGEN_COLOR : meta.marker
          const active = selectedId === f.id
          return [
            <Polyline
              key={`fgeom-bg-${f.id}`}
              positions={lines}
              pathOptions={{ color: "#ffffff", weight: active ? 11 : 8, opacity: 0.85 }}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
            />,
            <Polyline
              key={`fgeom-${f.id}`}
              positions={lines}
              pathOptions={{
                color,
                weight: active ? 7 : 5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
            >
              {/* Tag der markierten Strecke: WAS ist hier — Kategorie + Severity + Bezeichnung */}
              <Tooltip sticky direction="top">
                <span className="font-semibold">{katMeta(f.kategorie).label}</span> · {meta.label}
                {f.titel ? ` · ${f.titel}` : ""}
              </Tooltip>
            </Polyline>,
          ]
        })}

        {/* Fund-Marker, gruppiert: mehrere Funde am selben Ort (z.B. beide Fahrtrichtungen
            derselben Maßnahme) werden EIN Marker mit Tabs zum Aufsplitten — keiner geht verloren. */}
        {findingGroups.map((group) => (
          <FindingMarker
            key={group[0].id}
            group={group}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleteOwn={onDeleteOwn}
            onHide={onHide}
            canChat={canChat}
          />
        ))}
      </MapContainer>

      {/* Map-Controls unten links: Ebene + Vollbild + Zentrieren + Zoom +/− (Daten-Panels sitzen rechts) */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-col items-start gap-2">
        {/* Kartenebene: Ein-Klick-Toggle Satellit/Straßenkarte (Icon zeigt das Ziel). */}
        <div className="pointer-events-auto overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <LayerSwitcher buttonClassName="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900" />
        </div>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? "Vollbild verlassen" : "Vollbild"}
            title={isFs ? "Vollbild verlassen" : "Vollbild"}
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={centerOnRoute}
            aria-label="Auf Strecke zentrieren"
            title="Auf Strecke zentrieren"
            disabled={allPoints.length < 2}
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Locate className="h-4 w-4" />
          </button>
        </div>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Hineinzoomen"
            title="Hineinzoomen"
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px bg-neutral-200" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Herauszoomen"
            title="Herauszoomen"
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* T-480: Hinweis, dass mindestens eine Strecke nur grob geschätzt ist (gestrichelt gezeichnet). */}
      {drawn.some((r) => r.grob) ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm backdrop-blur-sm">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Gestrichelte Strecke = grobe Schätzung (Router war nicht erreichbar), kein exakter Straßenweg.
          </span>
        </div>
      ) : null}

      {/* Caller-Overlays (Suche, Daten-Panels, Zeitstrahl) — im Wrapper, also auch im Vollbild sichtbar. */}
      {children}
    </div>
  )
}
