import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: "start" | "end"
  className?: string
}

export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    window.addEventListener("keydown", onEsc)
    return () => {
      window.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(!open)}>{trigger}</button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[180px] rounded-md border border-neutral-200 bg-white shadow-lg py-1 animate-fade-in",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
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
        "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-100 text-left",
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
