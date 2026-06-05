import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: "sm" | "default" | "lg"
}

export function Dialog({ open, onClose, children, size = "default" }: DialogProps) {
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative bg-white rounded-lg shadow-2xl border border-neutral-200 max-h-[85vh] overflow-hidden flex flex-col w-full",
          size === "sm" && "max-w-sm",
          size === "default" && "max-w-2xl",
          size === "lg" && "max-w-4xl",
          "animate-fade-in",
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({
  title,
  subtitle,
  onClose,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
}) {
  return (
    <div className="border-b border-neutral-200 px-6 py-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {subtitle ? <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
