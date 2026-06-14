import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/cn"

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: "start" | "end"
  className?: string
}

// Menü hängt per Portal an document.body (fixed, am Trigger ausgerichtet). So wird es
// NICHT von overflow-Containern (z.B. der scrollbaren Sidebar) geclippt und liegt mit
// z-[1700] zuverlässig über Karten/Overlays (unter Dialogen z-[2000]).
export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)

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
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
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

  return (
    <div className="relative inline-block">
      <button ref={triggerRef} type="button" onClick={() => setOpen((o) => !o)}>
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
            onClick={() => setOpen(false)}
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
