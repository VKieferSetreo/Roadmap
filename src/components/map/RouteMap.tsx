// Leaflet-Karte mit Route-Polyline + Form+Farb-codierten Fund-Markern.
// Form = Kategorie-Gruppe (Bauwerk, Physik, Baustelle, Verkehr), Farbe = Severity.

import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Locate, Maximize2, Minimize2, Minus, Plus } from "lucide-react"
import type { Finding, ProjectRoute, RoutePoint } from "@/types/domain"
import { EIGEN_COLOR, istEigenerEintrag, katMeta, SEVERITY_META } from "@/components/project/findingMeta"
import { FindingMarker } from "./FindingMarker"
import { MapResize } from "./MapResize"
import { endPinIcon, startPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { groupFindings } from "@/lib/findingGroups"
import { geomToLines, sliceRouteByKm } from "@/lib/geom"
import { cn } from "@/lib/cn"

const GERMANY: [number, number] = [51.1657, 10.4515]

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
  /** Karte auf diesen Punkt zentrieren, sobald sich `nonce` ändert (Such-Treffer-Sprung). */
  focusPoint?: { lat: number; lng: number; nonce: number } | null
  className?: string
}

export function RouteMap({
  routes,
  findings,
  selectedId,
  onSelect,
  onRouteClick,
  onDeleteOwn,
  onHide,
  focusPoint,
  className,
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
        <MapResize />

        {drawn.map((r) => (
          /* je Strecke: weißer Schatten + Strecken-Farbe + Fahrtrichtungs-Fluss */
          <Polyline
            key={`bg-${r.id}`}
            positions={r.positions}
            pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
          />
        ))}
        {drawn.map((r) => (
          <Polyline
            key={`line-${r.id}`}
            positions={r.positions}
            pathOptions={{ color: r.farbe, weight: 5, opacity: 1 }}
          />
        ))}
        {drawn.map((r) => (
          <Polyline
            key={`flow-${r.id}`}
            positions={r.positions}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              opacity: 0.85,
              dashArray: "1 12",
              lineCap: "round",
              className: "route-flow",
            }}
          />
        ))}
        {/* Unsichtbare, breite Klick-Spur: Klick auf die Strecke → Eintrag-Maske.
            Liegt im overlayPane UNTER den Markern (markerPane) → Fund-Pins fangen
            ihre Klicks selbst ab, nur „freie" Strecken-Klicks lösen onRouteClick aus. */}
        {onRouteClick
          ? drawn.map((r) => (
              <Polyline
                key={`hit-${r.id}`}
                positions={r.positions}
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
            <Popup>Start — {r.name}</Popup>
          </Marker>
        ))}
        {drawn.map((r) => (
          <Marker
            key={`end-${r.id}`}
            position={r.positions[r.positions.length - 1]}
            icon={endPinIcon()}
          >
            <Popup>Ziel — {r.name}</Popup>
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
                {f.titel ? ` — ${f.titel}` : ""}
              </Tooltip>
            </Polyline>,
          ]
        })}

        {/* Fund-Marker, gruppiert: mehrere Funde am selben Ort (z.B. beide Fahrtrichtungen
            derselben Maßnahme) werden EIN Marker mit Tabs zum Aufsplitten — keiner geht verloren. */}
        {groupFindings(findings).map((group) => (
          <FindingMarker
            key={group[0].id}
            group={group}
            routes={routes}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleteOwn={onDeleteOwn}
            onHide={onHide}
          />
        ))}
      </MapContainer>

      {/* Map-Controls unten rechts: Zentrieren + Zoom +/− */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex flex-col items-end gap-2">
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
    </div>
  )
}
