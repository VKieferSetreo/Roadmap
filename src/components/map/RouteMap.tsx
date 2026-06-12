// Leaflet-Karte mit Route-Polyline + Form+Farb-codierten Fund-Markern.
// Form = Kategorie-Gruppe (Bauwerk, Physik, Baustelle, Verkehr), Farbe = Severity.

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Locate, Minus, Plus } from "lucide-react"
import type { Finding, ProjectRoute, RoutePoint } from "@/types/domain"
import { KATEGORIE_META, SEVERITY_META } from "@/components/project/findingMeta"
import { endPinIcon, findingPinIcon, startPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
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
  className?: string
}

export function RouteMap({ routes, findings, selectedId, onSelect, className }: RouteMapProps) {
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

  const centerOnRoute = () => {
    if (!mapRef.current || allPoints.length < 2) return
    mapRef.current.fitBounds(
      L.latLngBounds(allPoints.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48] },
    )
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
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

        {findings.map((f) => {
          const meta = SEVERITY_META[f.severity]
          const kat = KATEGORIE_META[f.kategorie]
          return (
            <Marker
              key={f.id}
              position={[f.lat, f.lng]}
              icon={findingPinIcon(f.kategorie, meta.marker, selectedId === f.id)}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
              zIndexOffset={selectedId === f.id ? 1000 : 0}
            >
              <Popup>
                <div className="min-w-[190px]">
                  <p className="font-semibold text-neutral-900">{f.titel}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {kat.label} · km {f.km.toLocaleString("de-DE")}
                    {f.strassenRef ? ` · ${f.strassenRef}` : ""}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                    {f.beschreibung}
                  </p>
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      SEVERITY_META[f.severity].soft,
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        SEVERITY_META[f.severity].dot,
                      )}
                    />
                    {meta.label}
                  </span>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Map-Controls unten rechts: Zentrieren + Zoom +/− */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex flex-col items-end gap-2">
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
