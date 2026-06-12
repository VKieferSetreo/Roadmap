// LKW-Visualisierung für die Achs-Konfiguration: Zugmaschine (2 Achsen) + modulare
// Anhänger-Blöcke mit den restlichen n−2 Achsen (à max. 3 pro Modul). Unter jeder
// Achse ein Eingabefeld für die jeweilige Achslast (Achslasten sind nicht überall gleich).

import { Fragment } from "react"
import { cn } from "@/lib/cn"

interface TruckAxlesProps {
  /** Achslast je Achse in t (Länge = Achsenzahl, min. 2). */
  achslasten: number[]
  onChange: (achslasten: number[]) => void
  disabled?: boolean
}

const ACHS_SLOT = 56 // px Breite pro Achs-Slot (Rad + Input darunter)
const MODUL_MAX = 3 // Achsen pro Anhänger-Modul

/** Verteilt n−2 Anhänger-Achsen auf Module à max. MODUL_MAX (Rest zuerst auffüllen). */
function moduleFor(rest: number): number[] {
  const module: number[] = []
  let left = rest
  while (left > 0) {
    const take = Math.min(MODUL_MAX, left)
    module.push(take)
    left -= take
  }
  return module
}

/** Rad als SVG-Gruppe (Außenreifen + Felge). */
function Rad({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill="#3F3F46" />
      <circle cx={cx} cy={cy} r={5.5} fill="#A1A1AA" />
      <circle cx={cx} cy={cy} r={2} fill="#52525B" />
    </g>
  )
}

/** Zugmaschine mit 2 Achsen (Seitenansicht, Front links). */
function Kabine() {
  const w = 2 * ACHS_SLOT
  return (
    <svg width={w} height={72} viewBox={`0 0 ${w} 72`} aria-hidden className="shrink-0">
      {/* Chassis */}
      <rect x={4} y={44} width={w - 8} height={8} rx={2} fill="#52525B" />
      {/* Fahrerhaus */}
      <path
        d={`M8 46 V20 q0 -6 6 -6 h${w * 0.45} q6 0 8 6 l6 14 v12 z`}
        fill="#87B52D"
        stroke="#527121"
        strokeWidth={1.5}
      />
      {/* Fenster */}
      <path
        d={`M${w * 0.45 + 10} 19 l5 12 h-14 v-12 z`}
        fill="#E8F2D5"
        stroke="#527121"
        strokeWidth={1}
      />
      {/* Auspuff/Detail */}
      <rect x={w - 18} y={30} width={8} height={16} rx={2} fill="#6A9221" />
      <Rad cx={ACHS_SLOT * 0.5} cy={56} />
      <Rad cx={ACHS_SLOT * 1.5} cy={56} />
    </svg>
  )
}

/** Anhänger-Modul (Flachbett) mit k Achsen. */
function Modul({ achsen }: { achsen: number }) {
  const w = achsen * ACHS_SLOT
  return (
    <svg width={w} height={72} viewBox={`0 0 ${w} 72`} aria-hidden className="shrink-0">
      {/* Kupplung */}
      <rect x={0} y={40} width={8} height={4} fill="#71717A" />
      {/* Ladefläche */}
      <rect
        x={4}
        y={28}
        width={w - 8}
        height={18}
        rx={3}
        fill="#D2E69C"
        stroke="#6A9221"
        strokeWidth={1.5}
      />
      <rect x={4} y={28} width={w - 8} height={5} rx={2.5} fill="#9BC73F" />
      {Array.from({ length: achsen }, (_, i) => (
        <Rad key={i} cx={ACHS_SLOT * (i + 0.5)} cy={56} />
      ))}
    </svg>
  )
}

export function TruckAxles({ achslasten, onChange, disabled }: TruckAxlesProps) {
  const n = achslasten.length
  if (n < 2) return null
  const module = moduleFor(n - 2)

  const setAchse = (idx: number, value: number) => {
    const next = [...achslasten]
    next[idx] = value
    onChange(next)
  }

  // Segment-Struktur: [Kabine(2), ...Module] — Inputs laufen global über alle Achsen
  const segmente: { achsen: number; kabine: boolean }[] = [
    { achsen: 2, kabine: true },
    ...module.map((m) => ({ achsen: m, kabine: false })),
  ]
  let achsIdx = 0

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max items-end gap-1.5">
        {segmente.map((seg, sIdx) => {
          const start = achsIdx
          achsIdx += seg.achsen
          return (
            <Fragment key={sIdx}>
              <div className="flex flex-col">
                {seg.kabine ? <Kabine /> : <Modul achsen={seg.achsen} />}
                {/* Achslast-Inputs exakt unter den Rädern (gleiche Slot-Breite) */}
                <div className="mt-1 flex">
                  {Array.from({ length: seg.achsen }, (_, i) => {
                    const idx = start + i
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center"
                        style={{ width: ACHS_SLOT }}
                      >
                        <input
                          type="number"
                          inputMode="decimal"
                          step={0.5}
                          min={0}
                          value={Number.isFinite(achslasten[idx]) ? achslasten[idx] : ""}
                          onChange={(e) => setAchse(idx, e.target.valueAsNumber || 0)}
                          disabled={disabled}
                          aria-label={`Achslast Achse ${idx + 1} (t)`}
                          className={cn(
                            "h-7 w-12 rounded-md border border-neutral-300 bg-white px-1 text-center text-xs tabular-nums",
                            "transition-colors hover:bg-neutral-50 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        />
                        <span className="mt-0.5 text-[10px] text-neutral-400">A{idx + 1}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
