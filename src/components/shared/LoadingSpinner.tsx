// Centered loading-spinner — used in <Suspense> fallbacks and during initial-fetch.

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/cn"

export function LoadingSpinner({
  size = 24,
  className,
  label = "Lädt...",
}: {
  size?: number
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-8 text-neutral-500",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="animate-spin" style={{ width: size, height: size }} />
      <span className="text-sm">{label}</span>
    </div>
  )
}
