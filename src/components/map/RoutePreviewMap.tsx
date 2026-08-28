// T-611: schlanke, read-only Strecken-Vorschau (Polyline + Start/Ziel-Pins, auto-fit). Für die
// Bestätigungs-Maske beim Anlegen (v.a. Google-Link) — der Nutzer SIEHT die aufgelöste Strecke und
// fängt jede Extraktions-Macke ab, bevor die Strecke angelegt wird. Bewusst minimal (kein Findings-Layer).
import { useEffect, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Kacheln } from "@/components/map/Kacheln"
import { MapResize } from "@/components/map/MapResize"
import { cn } from "@/lib/cn"

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
    const einpassen = () => {
      if (points.length < 2) return
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [22, 22] },
      )
    }
    einpassen()
    // T-648: Leaflet merkt sich die Containergröße beim Erzeugen. Der Dialog hängt per Portal ein
    // und blendet ein — misst Leaflet dabei daneben, lädt der Kachel-Layer für einen Ausschnitt,
    // den es gar nicht gibt, und der Kasten bleibt grau. Also nachmessen und neu einpassen, wie
    // es der Karten-Picker und die große Karte längst tun.
    const id = setTimeout(() => {
      map.invalidateSize()
      einpassen()
    }, 150)
    return () => clearTimeout(id)
  }, [map, points])
  return null
}

export function RoutePreviewMap({ points, className }: { points: Pt[]; className?: string }) {
  // T-648: Kacheln können ausbleiben (Netz/Filter/Rate-Limit beim Nutzer). Dann steht hier sonst nur
  // ein stummer grauer Kasten und der Nutzer denkt, die Karte sei kaputt — also sagen wir es.
  const [kachelFehler, setKachelFehler] = useState(false)
  // NaN-Koordinaten kippen fitBounds und die Polyline (T-546) — vor dem Zeichnen aussortieren.
  const clean = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  const pos = clean.map((p) => [p.lat, p.lng] as [number, number])
  return (
    <div className={cn("relative", className)}>
      <MapContainer
        center={[51.1, 10.4]}
        zoom={6}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
      >
        <Kacheln onTotalausfall={() => setKachelFehler(true)} />
        {pos.length >= 2 ? (
          <>
            <Polyline positions={pos} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }} />
            <Marker position={pos[0]} icon={START_ICON} />
            <Marker position={pos[pos.length - 1]} icon={ZIEL_ICON} />
          </>
        ) : null}
        <FitBounds points={clean} />
        {/* Der Dialog blendet ein (opacity) — ohne invalidateSize rechnet Leaflet mit einer alten
            Containergröße weiter und lädt zu wenig Kacheln nach. */}
        <MapResize />
      </MapContainer>
      {kachelFehler ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-white/85 px-2 py-1 text-center text-[11px] text-neutral-600">
          Kartenhintergrund konnte nicht geladen werden — der Streckenverlauf stimmt trotzdem.
        </div>
      ) : null}
    </div>
  )
}
