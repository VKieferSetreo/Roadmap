// Statische Karten-Vorschau für Projekt-Karten: echte OSM/CARTO-Tiles als Hintergrund
// (geografische Einordnung) + Strecken-Polylines + Fund-Dots als SVG-Overlay.
// Bewusst KEIN Leaflet — im Projekt-Grid wären das viele schwere Map-Instanzen;
// hier reichen 2–8 <img>-Tiles + Web-Mercator-Projektion.

import { useEffect, useMemo, useRef, useState } from "react"
import type { Finding, ProjectRoute, RoutePoint } from "@/types/domain"
import { SEVERITY_META } from "@/components/project/findingMeta"
import { cn } from "@/lib/cn"

interface MapPreviewProps {
  routes: ProjectRoute[]
  findings?: Finding[]
  /** virtuelle Viewport-Größe (wird per CSS auf den Container skaliert). */
  width?: number
  height?: number
  className?: string
}

const TILE = 256
const MAX_ZOOM = 11
const PAD = 28 // px Innenabstand der Route zum Rand

// ── Web-Mercator ──────────────────────────────────────────────────────────────
function worldX(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE * 2 ** z
}
function worldY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE * 2 ** z
}

interface Frame {
  z: number
  /** Welt-Pixel-Offset der linken oberen Viewport-Ecke. */
  ox: number
  oy: number
  tiles: { x: number; y: number; left: number; top: number }[]
  toXY: (p: RoutePoint) => [number, number]
}

/** Wählt den größten Zoom, bei dem die BBox (+Padding) in den Viewport passt,
 *  zentriert sie und sammelt die sichtbaren Tiles ein. */
function buildFrame(points: RoutePoint[], w: number, h: number): Frame | null {
  if (points.length === 0) return null
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  let z = MAX_ZOOM
  for (; z > 3; z--) {
    const spanX = worldX(maxLng, z) - worldX(minLng, z)
    const spanY = worldY(minLat, z) - worldY(maxLat, z) // y wächst nach Süden
    if (spanX <= w - PAD * 2 && spanY <= h - PAD * 2) break
  }

  const cx = (worldX(minLng, z) + worldX(maxLng, z)) / 2
  const cy = (worldY(minLat, z) + worldY(maxLat, z)) / 2
  const ox = cx - w / 2
  const oy = cy - h / 2

  const tiles: Frame["tiles"] = []
  const maxIdx = 2 ** z - 1
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
      if (ty < 0 || ty > maxIdx) continue
      tiles.push({
        x: ((tx % (maxIdx + 1)) + maxIdx + 1) % (maxIdx + 1),
        y: ty,
        left: tx * TILE - ox,
        top: ty * TILE - oy,
      })
    }
  }
  return { z, ox, oy, tiles, toXY: (p) => [worldX(p.lng, z) - ox, worldY(p.lat, z) - oy] }
}

function tileUrl(x: number, y: number, z: number): string {
  const sub = "abcd"[(x + y) % 4]
  return `https://${sub}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`
}

export function MapPreview({
  routes,
  findings = [],
  width = 560,
  height = 200,
  className,
}: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // cover-Skalierung des virtuellen Viewports auf die Containergröße (resize-fest)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setScale(Math.max(el.clientWidth / width, el.clientHeight / height))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height])

  // T-593: ungeprüfte VEMAGS-Strecken nicht in der Vorschau zeichnen (konsistent zu Karte + Auswertung).
  const sichtbar = useMemo(
    () => routes.filter((r) => !(r.source === "vemags" && r.verifiziert !== true)),
    [routes],
  )

  const frame = useMemo(() => {
    const pts = sichtbar.flatMap((r) => r.points)
    return buildFrame(pts, width, height)
  }, [sichtbar, width, height])

  const paths = useMemo(() => {
    if (!frame) return []
    return sichtbar
      .filter((r) => r.points.length >= 2)
      .map((r) => {
        // auf ~120 Punkte ausdünnen — visuell identisch, hält das SVG klein
        const step = Math.max(1, Math.floor(r.points.length / 120))
        const pts = r.points
          .filter((_, i) => i % step === 0 || i === r.points.length - 1)
          .map(frame.toXY)
        return {
          id: r.id,
          farbe: r.farbe,
          d: pts
            .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
            .join(" "),
          start: pts[0],
          end: pts[pts.length - 1],
        }
      })
  }, [sichtbar, frame])

  if (!frame || paths.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
      aria-hidden
    >
      {/* Tile-Ebene — virtueller Viewport, per cover-Scale auf den Container gelegt */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0" style={{ width, height, transform: `scale(${scale})` }}>
          {frame.tiles.map((t) => (
            <img
              key={`${t.x}-${t.y}`}
              src={tileUrl(t.x, t.y, frame.z)}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute select-none"
              style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
            />
          ))}
          {/* sanfte Aufhellung, damit Routen/Pins klar vorne bleiben */}
          <div className="absolute inset-0 bg-white/25" />
          <svg width={width} height={height} className="absolute inset-0">
            {paths.map((p) => (
              <g key={p.id}>
                <path
                  d={p.d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={p.d}
                  fill="none"
                  stroke={p.farbe}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {findings.map((f) => {
              const [x, y] = frame.toXY({ lat: f.lat, lng: f.lng })
              return (
                <circle
                  key={f.id}
                  cx={x}
                  cy={y}
                  r={3.2}
                  fill={SEVERITY_META[f.severity].marker}
                  stroke="#fff"
                  strokeWidth={1.2}
                />
              )
            })}
            {paths.map((p) => (
              <g key={`se-${p.id}`}>
                <circle
                  cx={p.start[0]}
                  cy={p.start[1]}
                  r={4.5}
                  fill={p.farbe}
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <circle
                  cx={p.end[0]}
                  cy={p.end[1]}
                  r={4.5}
                  fill="#DC2626"
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <circle cx={p.end[0]} cy={p.end[1]} r={1.6} fill="#fff" />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <span className="absolute bottom-0.5 right-1 text-[8px] leading-none text-neutral-400/80">
        © OSM · CARTO
      </span>
    </div>
  )
}
