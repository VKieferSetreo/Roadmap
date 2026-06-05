import { Truck } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  blockadeCounts,
  mockBlockades,
  type Severity,
} from "@/data/mockRoute"

const SEVERITY_COLOR: Record<Severity, { bg: string; ring: string }> = {
  blocked: { bg: "bg-red-500", ring: "ring-red-100" },
  warning: { bg: "bg-amber-500", ring: "ring-amber-100" },
  ok: { bg: "bg-emerald-500", ring: "ring-emerald-100" },
}

/**
 * Kollabierte „Rail"-Ansicht der Sidebar:
 * - Truck-Header
 * - vertikaler Severity-Counter (rot/amber/grün mit Zahl)
 * - Mini-Marker pro Blockade (klickbar → Detail-Drawer)
 */
export function SidebarRail({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const counts = blockadeCounts(mockBlockades)

  return (
    <div className="w-full h-full flex flex-col items-center bg-white">
      {/* Header */}
      <div className="w-full border-b border-neutral-200 py-3 flex flex-col items-center gap-1">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700">
          <Truck className="h-4 w-4" />
        </span>
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold">
          Route
        </span>
      </div>

      {/* Severity-Counter (vertikal) */}
      <div className="w-full py-3 flex flex-col items-center gap-2 border-b border-neutral-200">
        <CountChip n={counts.blocked} severity="blocked" />
        <CountChip n={counts.warning} severity="warning" />
        <CountChip n={counts.ok} severity="ok" />
      </div>

      {/* Mini-Marker pro Blockade */}
      <div className="flex-1 w-full overflow-y-auto py-2 flex flex-col items-center gap-1.5">
        {mockBlockades.map((b, idx) => {
          const c = SEVERITY_COLOR[b.severity]
          const selected = selectedId === b.id
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect?.(b.id)}
              title={`${b.road} ${b.km} · ${b.title}`}
              aria-label={`${b.road} ${b.km} · ${b.title}`}
              className={cn(
                "w-9 h-9 rounded-md flex items-center justify-center text-[10px] font-bold text-white relative transition-all",
                c.bg,
                selected
                  ? "ring-2 ring-offset-1 ring-primary-500 scale-105"
                  : "ring-1 ring-white shadow hover:scale-105",
              )}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CountChip({ n, severity }: { n: number; severity: Severity }) {
  const c = SEVERITY_COLOR[severity]
  return (
    <div className="flex items-center gap-1.5 w-9">
      <span className={cn("h-3 w-3 rounded-full ring-2", c.bg, c.ring)} />
      <span className="text-xs font-semibold tabular-nums text-neutral-700">{n}</span>
    </div>
  )
}
