// Optionale Sidebar — aktuell nicht im AppLayout gemountet, bei Bedarf einhängen.

import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function Sidebar({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <aside
      className={cn(
        "hidden lg:flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white",
        className,
      )}
      aria-label="Seitennavigation"
    >
      {children}
    </aside>
  )
}
