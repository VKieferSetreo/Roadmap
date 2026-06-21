import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/cn"

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: "start" | "end"
  className?: string
  /** Barrierefreier Name des Trigger-Buttons (Pflicht bei Icon-only-Triggern —
   *  ein aria-label auf einem Kind-<span> benennt den fokussierbaren Button NICHT). */
  triggerLabel?: string
}

// Menü hängt per Portal an document.body (fixed, am Trigger ausgerichtet). So wird es
// NICHT von overflow-Containern (z.B. der scrollbaren Sidebar) geclippt und liegt mit
// z-[1700] zuverlässig über Karten/Overlays (unter Dialogen z-[2000]).
export function DropdownMenu({ trigger, children, align = "end", className, triggerLabel }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)

  // T-241: schließen + Fokus an den Trigger zurückgeben (für Tastatur-/Escape-Wege).
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      setPos(
        align === "end"
          ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }
          : { top: r.bottom + 4, left: r.left },
      )
    }
    place()
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false) // Klick außerhalb → KEIN Fokus-Steal (der Nutzer hat woanders hingeklickt)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("mousedown", onClick)
    window.addEventListener("keydown", onEsc)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onEsc)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, align])

  // T-241: beim Öffnen den Fokus auf das erste Menüelement legen (Tastatur-Bedienung).
  useEffect(() => {
    if (open && pos) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    }
  }, [open, pos])

  // T-241: Pfeiltasten-Roving zwischen den Menüelementen + Home/End.
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus() }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus() }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus() }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus() }
  }

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && pos
        ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
            className={cn(
              "z-[1700] min-w-[180px] animate-fade-in rounded-md border border-neutral-200 bg-white py-1 shadow-lg",
              className,
            )}
            onKeyDown={onMenuKey}
            onClick={close}
          >
            {children}
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}

export function DropdownItem({
  onClick,
  children,
  destructive,
}: {
  onClick?: () => void
  children: ReactNode
  destructive?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100",
        destructive && "text-red-600 hover:bg-red-50",
      )}
    >
      {children}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-neutral-200" />
}
