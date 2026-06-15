// Leichtgewichtige Streckenvorschau: normalisiert die Punktfolge in eine kleine SVG-Linie
// (keine Karten-Tiles). Zeigt die Form der Route in der Listen-Ansicht.

import type { RoutePoint } from "@/types/domain"

const W = 56
const H = 36
const PAD = 5

export function RoutePreview({ points, color }: { points: RoutePoint[]; color: string }) {
  if (!Array.isArray(points) || points.length < 2) {
    return <div className="h-9 w-14 shrink-0 rounded border border-neutral-200 bg-neutral-50" aria-hidden />
  }
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  const dLat = maxLat - minLat || 1e-6
  const dLng = maxLng - minLng || 1e-6
  const scale = Math.min((W - 2 * PAD) / dLng, (H - 2 * PAD) / dLat)
  const offX = (W - dLng * scale) / 2
  const offY = (H - dLat * scale) / 2
  // auf ~40 Punkte ausdünnen — reicht für die Form, hält das SVG klein
  const step = Math.max(1, Math.floor(points.length / 40))
  const thinned = points.filter((_, i) => i % step === 0)
  const d = thinned
    .map((p, i) => {
      const x = offX + (p.lng - minLng) * scale
      const y = offY + (maxLat - p.lat) * scale // lat invertiert (SVG-y zeigt nach unten)
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join("")

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 rounded border border-neutral-200 bg-neutral-50"
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
