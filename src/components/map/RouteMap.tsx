// Leaflet-Karte mit Route-Polyline + farbcodierten Fund-Markern.
// Eigene divIcons (kein Default-Marker-Asset → keine Vite-Asset-Probleme).

import { useEffect, useMemo } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Finding, RoutePoint } from "@/types/domain"
import { KATEGORIE_META, SEVERITY_META } from "@/components/project/findingMeta"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { cn } from "@/lib/cn"

const GERMANY: [number, number] = [51.1657, 10.4515]

function pinIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 30 : 22
  return L.divIcon({
    className: "rm-pin",
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      ${selected ? "outline:3px solid " + color + "55;" : ""}
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

function endpointIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "rm-endpoint",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;
      font:700 11px/1 Inter,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
    ">${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  })
}

/** Passt den Kartenausschnitt an die Strecke an, sobald sie sich ändert. */
function FitBounds({ points, enabled }: { points: RoutePoint[]; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled || points.length < 2) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48] })
  }, [map, points, enabled])
  // Karte korrekt vermessen, wenn der Container erst nach Mount Größe bekommt (Tab-Wechsel)
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 80)
    return () => clearTimeout(id)
  }, [map])
  return null
}

interface RouteMapProps {
  geometry: RoutePoint[]
  findings: Finding[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
}

export function RouteMap({ geometry, findings, selectedId, onSelect, className }: RouteMapProps) {
  const tileStyle = useSettingsStore((s) => s.tileStyle)
  const autoFit = useSettingsStore((s) => s.autoFit)
  const tiles = TILE_LAYERS[tileStyle]
  const positions = useMemo(
    () => geometry.map((p) => [p.lat, p.lng] as [number, number]),
    [geometry],
  )

  return (
    <MapContainer
      center={GERMANY}
      zoom={6}
      scrollWheelZoom
      className={cn("h-full w-full", className)}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer key={tileStyle} attribution={tiles.attribution} url={tiles.url} />

      {positions.length >= 2 ? (
        <>
          <Polyline positions={positions} pathOptions={{ color: "#527121", weight: 5, opacity: 0.85 }} />
          <Marker position={positions[0]} icon={endpointIcon("A", "#6A9221")}>
            <Popup>Start</Popup>
          </Marker>
          <Marker position={positions[positions.length - 1]} icon={endpointIcon("Z", "#27272A")}>
            <Popup>Ziel</Popup>
          </Marker>
          <FitBounds points={geometry} enabled={autoFit} />
        </>
      ) : null}

      {findings.map((f) => {
        const meta = SEVERITY_META[f.severity]
        const kat = KATEGORIE_META[f.kategorie]
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={pinIcon(meta.marker, selectedId === f.id)}
            eventHandlers={{ click: () => onSelect?.(f.id) }}
            zIndexOffset={selectedId === f.id ? 1000 : 0}
          >
            <Popup>
              <strong>{kat.label} · {f.titel}</strong>
              <br />
              {f.beschreibung}
              <br />
              <span style={{ color: "#71717A" }}>
                km {f.km.toLocaleString("de-DE")} · {meta.label}
              </span>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
