import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: "default" | "wide"
  ariaLabel?: string
}

export function Sheet({ open, onClose, children, size = "default", ariaLabel }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onEsc)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onEsc)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label={ariaLabel} className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 animate-fade-in bg-neutral-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex animate-slide-in-right flex-col overflow-hidden border-l border-neutral-200 bg-white shadow-2xl",
          size === "wide" ? "w-full sm:max-w-3xl" : "w-full sm:max-w-[480px] xl:max-w-[640px]",
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function SheetHeader({
  title,
  subtitle,
  onClose,
  rightExtra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
  rightExtra?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-neutral-200 bg-white px-6 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold leading-tight text-neutral-900">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-xs text-neutral-500">{subtitle}</p> : null}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {rightExtra}
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Drawer schließen"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>
}

export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-3">
      {children}
    </div>
  )
}
