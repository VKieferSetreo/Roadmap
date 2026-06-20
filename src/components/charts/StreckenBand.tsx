// Streckenprofil: Funde als Lollipops entlang der km-Achse (pures SVG, domänen-
// spezifisch). Klick auf einen Fund meldet die ID nach oben (→ Liste aufklappen).

import { useMemo, useState } from "react"
import type { Finding } from "@/types/domain"
import { katMeta, SEVERITY_META } from "@/components/project/findingMeta"
import { cn } from "@/lib/cn"

interface StreckenBandProps {
  findings: Finding[]
  distanzKm: number
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
}

const H = 84
const PAD_X = 14
const BASE_Y = H - 26

export function StreckenBand({
  findings,
  distanzKm,
  selectedId,
  onSelect,
  className,
}: StreckenBandProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const items = useMemo(() => {
    if (!distanzKm || findings.length === 0) return []
    return findings
      .slice()
      .sort((a, b) => a.km - b.km)
      .map((f) => ({
        f,
        // x in Prozent der Streckenlänge
        pct: Math.min(1, Math.max(0, f.km / distanzKm)),
      }))
  }, [findings, distanzKm])

  if (items.length === 0) return null

  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const active = hovered ?? selectedId
  const activeItem = items.find((i) => i.f.id === active)

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 1000 ${H}`}
        preserveAspectRatio="none"
        className="h-[84px] w-full"
        role="img"
        aria-label={`Streckenprofil mit ${items.length} Funden auf ${Math.round(distanzKm).toLocaleString("de-DE")} km`}
      >
        {/* Basislinie = Strecke */}
        <line
          x1={PAD_X}
          y1={BASE_Y}
          x2={1000 - PAD_X}
          y2={BASE_Y}
          stroke="#E5E5E8"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <line
          x1={PAD_X}
          y1={BASE_Y}
          x2={1000 - PAD_X}
          y2={BASE_Y}
          stroke="#B3D566"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* km-Ticks */}
        {ticks.map((t) => {
          const x = PAD_X + t * (1000 - PAD_X * 2)
          return (
            <g key={t}>
              <line
                x1={x}
                y1={BASE_Y - 3}
                x2={x}
                y2={BASE_Y + 3}
                stroke="#A1A1AA"
                strokeWidth={1}
              />
              <text
                x={x}
                y={H - 8}
                textAnchor="middle"
                fontSize={11}
                fill="#A1A1AA"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {Math.round(distanzKm * t).toLocaleString("de-DE")} km
              </text>
            </g>
          )
        })}

        {/* Lollipops — kritisch zuletzt (oben) */}
        {items
          .slice()
          .sort((a, b) => SEVERITY_META[b.f.severity].rank - SEVERITY_META[a.f.severity].rank)
          .map(({ f, pct }) => {
            const x = PAD_X + pct * (1000 - PAD_X * 2)
            const isActive = active === f.id
            const r = isActive ? 7 : 5
            const stemH =
              SEVERITY_META[f.severity].rank === 0
                ? 30
                : SEVERITY_META[f.severity].rank === 1
                  ? 22
                  : 15
            return (
              <g
                key={f.id}
                onClick={() => onSelect?.(f.id)}
                onMouseEnter={() => setHovered(f.id)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                {/* unsichtbare größere Hitbox */}
                <rect
                  x={x - 10}
                  y={BASE_Y - stemH - 12}
                  width={20}
                  height={stemH + 16}
                  fill="transparent"
                />
                <line
                  x1={x}
                  y1={BASE_Y}
                  x2={x}
                  y2={BASE_Y - stemH}
                  stroke={SEVERITY_META[f.severity].marker}
                  strokeWidth={isActive ? 2.4 : 1.6}
                />
                <circle
                  cx={x}
                  cy={BASE_Y - stemH - 4}
                  r={r}
                  fill={SEVERITY_META[f.severity].marker}
                  stroke="#fff"
                  strokeWidth={1.8}
                  style={{ transition: "r 120ms ease" }}
                />
              </g>
            )
          })}
      </svg>

      {/* Hover-/Auswahl-Detailzeile statt schwebendem Tooltip (auch Touch-tauglich) */}
      <div className="mt-1 h-5 px-1 text-xs text-neutral-500">
        {activeItem ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                SEVERITY_META[activeItem.f.severity].dot,
              )}
            />
            <span className="font-medium text-neutral-700">{activeItem.f.titel}</span>
            <span>
              · {katMeta(activeItem.f.kategorie).label} · km{" "}
              {activeItem.f.km.toLocaleString("de-DE")}
            </span>
          </span>
        ) : (
          <span className="text-neutral-400">
            Fund anklicken, um Details in der Liste zu öffnen.
          </span>
        )}
      </div>
    </div>
  )
}
