import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: "default" | "wide"
  ariaLabel?: string
  /** Wenn false: kein Backdrop, kein Body-Scroll-Lock, Rest der App bleibt klickbar.
   *  Default true (klassischer modaler Drawer). */
  modal?: boolean
}

export function Sheet({
  open,
  onClose,
  children,
  size = "default",
  ariaLabel,
  modal = true,
}: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onEsc)
    if (modal) document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onEsc)
      if (modal) document.body.style.overflow = ""
    }
  }, [open, onClose, modal])

  if (!open) return null

  // Non-modal: Wrapper hat pointer-events:none, nur das Panel-Element selbst
  // wird wieder pointer-events:auto, damit Klicks außerhalb auf der Seite landen.
  const wrapperPointerCls = modal ? "" : "pointer-events-none"
  const panelPointerCls = modal ? "" : "pointer-events-auto"

  return (
    <div
      role="dialog"
      aria-modal={modal}
      aria-label={ariaLabel}
      className={cn("fixed inset-0 z-40", wrapperPointerCls)}
    >
      {modal ? (
        <div
          className="absolute inset-0 bg-neutral-950/40 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-y-0 right-0 bg-white shadow-2xl flex flex-col overflow-hidden border-l border-neutral-200 animate-slide-in-right",
          size === "wide" ? "w-full sm:max-w-3xl" : "w-full sm:max-w-[480px] xl:max-w-[640px]",
          panelPointerCls,
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
    <div className="sticky top-0 bg-white z-10 border-b border-neutral-200 px-6 py-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-neutral-900 leading-tight flex items-center gap-2 flex-wrap">
          {title}
        </h2>
        {subtitle ? <p className="text-xs text-neutral-500 mt-1">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
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
    <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-3 flex items-center justify-end gap-2">
      {children}
    </div>
  )
}
