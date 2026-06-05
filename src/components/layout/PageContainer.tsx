// Standard-Page-Wrapper: max-width-Container + Header + Content-Slot.

import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

interface PageContainerProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** "wide" für volle Breite, "narrow" für Forms. */
  width?: "narrow" | "default" | "wide"
}

export function PageContainer({
  title,
  description,
  actions,
  children,
  className,
  width = "default",
}: PageContainerProps) {
  const widthClass =
    width === "wide" ? "max-w-none" : width === "narrow" ? "max-w-3xl" : "max-w-7xl"

  return (
    <div
      className={cn(
        "mx-auto w-full px-4 lg:px-6 py-6 flex flex-col gap-6",
        widthClass,
        className,
      )}
    >
      <header className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
