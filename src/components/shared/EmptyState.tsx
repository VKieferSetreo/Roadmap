// Generic Empty-State mit Icon, Titel, Description und optionalem CTA-Slot.

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Aktions-Slot (Button etc.) unter Description. */
  cta?: ReactNode
  /** Legacy-Prop — `cta` bevorzugen. Bleibt aus Kompatibilitätsgründen. */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  action,
  className,
}: EmptyStateProps) {
  const cta_resolved = cta ?? action
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        "border-2 border-dashed border-neutral-200 rounded-lg bg-neutral-50/50",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {Icon ? (
        <div className="rounded-full bg-neutral-100 p-3 mb-3">
          <Icon className="h-6 w-6 text-neutral-400" />
        </div>
      ) : null}
      <h3 className="font-semibold text-neutral-700">{title}</h3>
      {description ? (
        <p className="text-sm text-neutral-500 mt-1 max-w-sm">{description}</p>
      ) : null}
      {cta_resolved ? <div className="mt-4">{cta_resolved}</div> : null}
    </div>
  )
}
