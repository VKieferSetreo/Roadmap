// Beta-Sticker: macht sichtbar, dass das System noch in Entwicklung ist (Beta-Phase,
// nicht final/live). Wird im Header neben dem Produktnamen gezeigt.

import { cn } from "@/lib/cn"

export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      title="Beta-Phase — das System ist noch in Entwicklung und nicht final. Funktionen und Daten können sich ändern."
      className={cn(
        "inline-flex select-none items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      Beta
    </span>
  )
}
