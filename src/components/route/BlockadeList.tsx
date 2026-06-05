import { AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet, Info, XCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import {
  blockadeCounts,
  mockBlockades,
  type Blockade,
  type Severity,
} from "@/data/mockRoute"

const SEVERITY_META: Record<
  Severity,
  {
    label: string
    badgeBg: string
    badgeText: string
    badgeBorder: string
    barColor: string
    icon: typeof XCircle
  }
> = {
  blocked: {
    label: "gesperrt",
    badgeBg: "bg-red-50",
    badgeText: "text-red-700",
    badgeBorder: "border-red-200",
    barColor: "bg-red-500",
    icon: XCircle,
  },
  warning: {
    label: "Warnung",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    badgeBorder: "border-amber-200",
    barColor: "bg-amber-500",
    icon: AlertTriangle,
  },
  ok: {
    label: "frei",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    badgeBorder: "border-emerald-200",
    barColor: "bg-emerald-500",
    icon: CheckCircle2,
  },
}

export function BlockadeList({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const counts = blockadeCounts(mockBlockades)
  const overall: Severity =
    counts.blocked > 0 ? "blocked" : counts.warning > 0 ? "warning" : "ok"

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Status-Banner */}
      <StatusBanner overall={overall} counts={counts} />

      {/* Scrollbare Liste */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {mockBlockades.map((b) => (
          <BlockadeCard
            key={b.id}
            blockade={b}
            selected={selectedId === b.id}
            onClick={() => onSelect?.(b.id)}
          />
        ))}
      </div>

      {/* Footer: Export */}
      <div className="border-t border-neutral-200 p-3 bg-white flex flex-col gap-2">
        <span className="text-[11px] text-neutral-500 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Datenstand: vor 12 min
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="w-full">
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" className="w-full">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Excel
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatusBanner({
  overall,
  counts,
}: {
  overall: Severity
  counts: { blocked: number; warning: number; ok: number }
}) {
  const meta = SEVERITY_META[overall]
  const Icon = meta.icon
  const message =
    overall === "blocked"
      ? "Strecke nicht befahrbar"
      : overall === "warning"
        ? "Strecke nur mit Auflagen"
        : "Strecke befahrbar"

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className={cn("h-1 w-full", meta.barColor)} />
      <div className="px-4 py-3 flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full",
            meta.badgeBg,
            meta.badgeText,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-neutral-900">{message}</div>
          <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
            <CountBadge n={counts.blocked} color="bg-red-500" />
            <CountBadge n={counts.warning} color="bg-amber-500" />
            <CountBadge n={counts.ok} color="bg-emerald-500" />
            <span className="ml-1">
              {counts.blocked + counts.warning + counts.ok} Befunde
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CountBadge({ n, color }: { n: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
      <span className="tabular-nums font-semibold text-neutral-800">{n}</span>
    </span>
  )
}

function BlockadeCard({
  blockade,
  selected,
  onClick,
}: {
  blockade: Blockade
  selected: boolean
  onClick: () => void
}) {
  const meta = SEVERITY_META[blockade.severity]
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-white shadow-sm transition-all p-3 flex gap-3",
        "hover:border-neutral-300 hover:shadow",
        selected
          ? "border-primary-500 ring-2 ring-primary-100"
          : "border-neutral-200",
      )}
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0",
          meta.badgeBg,
          meta.badgeText,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border",
              meta.badgeBg,
              meta.badgeText,
              meta.badgeBorder,
            )}
          >
            {meta.label}
          </span>
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {blockade.road} · {blockade.km}
          </span>
        </div>
        <div className="text-sm font-semibold text-neutral-900 mt-1 leading-snug">
          {blockade.title}
        </div>
        <div className="text-xs text-neutral-600 mt-0.5 line-clamp-2">
          {blockade.description}
        </div>
        {blockade.validUntil ? (
          <div className="text-[10px] text-neutral-400 mt-1.5">
            gültig bis {blockade.validUntil}
          </div>
        ) : null}
      </div>
    </button>
  )
}
