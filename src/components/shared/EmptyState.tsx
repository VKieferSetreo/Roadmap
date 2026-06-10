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
  className?: string
}

export function EmptyState({ icon: Icon, title, description, cta, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        "rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-50/50",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {Icon ? (
        <div className="mb-3 rounded-full bg-neutral-100 p-3">
          <Icon className="h-6 w-6 text-neutral-400" />
        </div>
      ) : null}
      <h3 className="font-semibold text-neutral-700">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p> : null}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  )
}
