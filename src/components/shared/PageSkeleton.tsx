// Skeleton-Layout für ladende Listen — minimiert Layout-Shift.
// Varianten: list (default) | cards | detail

import { cn } from "@/lib/cn"

interface PageSkeletonProps {
  variant?: "list" | "cards" | "detail"
  rows?: number
  className?: string
}

export function PageSkeleton({
  variant = "list",
  rows = 5,
  className,
}: PageSkeletonProps) {
  if (variant === "cards") {
    return (
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
          className,
        )}
        aria-busy="true"
        aria-live="polite"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-neutral-200 bg-white p-4 flex flex-col gap-3"
          >
            <SkelLine className="h-4 w-3/4" />
            <SkelLine className="h-3 w-1/3" />
            <div className="h-px bg-neutral-100 my-1" />
            <div className="flex justify-between">
              <SkelLine className="h-3 w-12" />
              <SkelLine className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (variant === "detail") {
    return (
      <div
        className={cn("flex flex-col gap-4", className)}
        aria-busy="true"
        aria-live="polite"
      >
        <SkelLine className="h-7 w-1/3" />
        <SkelLine className="h-4 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-neutral-200 bg-white p-4 flex flex-col gap-2"
            >
              <SkelLine className="h-3 w-1/2" />
              <SkelLine className="h-7 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // list (default)
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-neutral-200 bg-white p-3 flex items-center gap-3"
        >
          <div className="h-8 w-8 rounded-full bg-neutral-100 animate-shimmer bg-shimmer" />
          <div className="flex flex-col gap-2 flex-1">
            <SkelLine className="h-4 w-2/3" />
            <SkelLine className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SkelLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-100",
        "bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  )
}
