// T-611: schlanke, read-only Strecken-Vorschau (Polyline + Start/Ziel-Pins, auto-fit). Für die
// Bestätigungs-Maske beim Anlegen (v.a. Google-Link) — der Nutzer SIEHT die aufgelöste Strecke und
// fängt jede Extraktions-Macke ab, bevor die Strecke angelegt wird. Bewusst minimal (kein Findings-Layer).
import { useEffect } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"

type Pt = { lat: number; lng: number }

const dot = (color: string) =>
  L.divIcon({
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
const START_ICON = dot("#16a34a")
const ZIEL_ICON = dot("#dc2626")

function FitBounds({ points }: { points: Pt[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 2) return
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [22, 22] },
    )
  }, [map, points])
  return null
}

export function RoutePreviewMap({ points, className }: { points: Pt[]; className?: string }) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]
  const pos = points.map((p) => [p.lat, p.lng] as [number, number])
  return (
    <MapContainer
      center={[51.1, 10.4]}
      zoom={6}
      className={className}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom
    >
      <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} />
      {tiles.overlays?.map((u) => (
        <TileLayer key={u} url={u} zIndex={2} />
      ))}
      {pos.length >= 2 ? (
        <>
          <Polyline positions={pos} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }} />
          <Marker position={pos[0]} icon={START_ICON} />
          <Marker position={pos[pos.length - 1]} icon={ZIEL_ICON} />
        </>
      ) : null}
      <FitBounds points={points} />
    </MapContainer>
  )
}
