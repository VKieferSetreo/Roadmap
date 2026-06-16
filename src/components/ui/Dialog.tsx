import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"
import { useFocusTrap } from "@/lib/useFocusTrap"

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: "sm" | "default" | "lg"
}

// Verbindet das Dialog-Panel (aria-labelledby) mit der Überschrift in DialogHeader.
const DialogTitleIdContext = createContext<string | undefined>(undefined)

export function Dialog({ open, onClose, children, size = "default" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

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

  // Fokus beim Öffnen in den Dialog, Tab darin halten, beim Schließen zurückgeben.
  useFocusTrap(panelRef, open)

  if (!open) return null

  // Portal an document.body + z-index ÜBER Leaflet (dessen Panes/Controls reichen
  // bis z-index ~1000). Ohne Portal landet der Dialog im Stacking-Context der Karte
  // und damit HINTER den Map-Layern — die Maske wäre unsichtbar/unbedienbar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-overlay outline-none",
          size === "sm" && "max-w-sm",
          size === "default" && "max-w-2xl",
          size === "lg" && "max-w-4xl",
          "animate-fade-in",
        )}
      >
        <DialogTitleIdContext.Provider value={titleId}>{children}</DialogTitleIdContext.Provider>
      </div>
    </div>,
    document.body,
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
  const titleId = useContext(DialogTitleIdContext)
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-6 py-4">
      <div>
        <h2 id={titleId} className="text-base font-semibold text-neutral-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p> : null}
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
