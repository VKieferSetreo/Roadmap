// Mini-Streckenvorschau als pures SVG: normalisierte Polyline + Start-/Ziel-Punkte
// + Fund-Dots (severity-gefärbt). Für Projekt-Karten — kein Leaflet, kein Netz.

import { useMemo } from "react"
import type { Finding, RoutePoint } from "@/types/domain"
import { SEVERITY_META } from "@/components/project/findingMeta"
import { cn } from "@/lib/cn"

interface RoutePreviewProps {
  geometry: RoutePoint[]
  findings?: Finding[]
  className?: string
}

const W = 280
const H = 96
const PAD = 12

function project(points: RoutePoint[]) {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  // Längengrad auf Breitengrad-Verhältnis korrigieren (grobe Mercator-Näherung),
  // damit die Route nicht verzerrt wirkt.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const lngScale = Math.cos(midLat)
  const spanLat = Math.max(maxLat - minLat, 1e-6)
  const spanLng = Math.max((maxLng - minLng) * lngScale, 1e-6)
  const scale = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat)
  const offX = (W - spanLng * scale) / 2
  const offY = (H - spanLat * scale) / 2
  return (p: RoutePoint): [number, number] => [
    offX + (p.lng - minLng) * lngScale * scale,
    H - (offY + (p.lat - minLat) * scale),
  ]
}

export function RoutePreview({ geometry, findings = [], className }: RoutePreviewProps) {
  const { path, start, end, dots } = useMemo(() => {
    if (geometry.length < 2) return { path: "", start: null, end: null, dots: [] as const }
    const toXY = project(geometry)
    // Auf ~80 Punkte ausdünnen — reicht visuell, hält das SVG klein.
    const step = Math.max(1, Math.floor(geometry.length / 80))
    const pts = geometry.filter((_, i) => i % step === 0 || i === geometry.length - 1).map(toXY)
    const d = pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ")
    const dotList = findings
      .slice()
      .sort((a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank)
      .map((f) => {
        const [x, y] = toXY({ lat: f.lat, lng: f.lng })
        return { x, y, color: SEVERITY_META[f.severity].marker, id: f.id }
      })
    return { path: d, start: pts[0], end: pts[pts.length - 1], dots: dotList }
  }, [geometry, findings])

  if (!path) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-full w-full", className)}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      {/* weicher Untergrund-Stroke + Marken-Stroke */}
      <path
        d={path}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke="#87B52D"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots.map((d) => (
        <circle key={d.id} cx={d.x} cy={d.y} r={3} fill={d.color} stroke="#fff" strokeWidth={1.2} />
      ))}
      {start ? (
        <circle
          cx={start[0]}
          cy={start[1]}
          r={4.5}
          fill="#6A9221"
          stroke="#fff"
          strokeWidth={1.6}
        />
      ) : null}
      {end ? (
        <>
          <circle cx={end[0]} cy={end[1]} r={4.5} fill="#DC2626" stroke="#fff" strokeWidth={1.6} />
          <circle cx={end[0]} cy={end[1]} r={1.6} fill="#fff" />
        </>
      ) : null}
    </svg>
  )
}
