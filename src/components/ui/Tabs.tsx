import { createContext, useContext, useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface TabsContextValue {
  value: string
  setValue: (v: string) => void
  baseId: string // T-508: stabiler Präfix für tab/panel-id-Verknüpfung (aria-controls/labelledby)
}

const TabsContext = createContext<TabsContextValue | null>(null)
const tabId = (base: string, v: string) => `${base}-tab-${v}`
const panelId = (base: string, v: string) => `${base}-panel-${v}`

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (v: string) => void
  children: ReactNode
  className?: string
}) {
  const [internal, setInternal] = useState(defaultValue ?? "")
  const baseId = useId()
  const current = value ?? internal
  const setValue = (v: string) => {
    if (onValueChange) onValueChange(v)
    else setInternal(v)
  }
  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-neutral-200", className)}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabsTrigger must be inside Tabs")
  const active = ctx.value === value
  // T-508: Pfeiltasten/Home/End bewegen Fokus zwischen den Tabs UND aktivieren (Activation-follows-Focus).
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const list = e.currentTarget.closest('[role="tablist"]')
    if (!list) return
    const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const i = tabs.indexOf(e.currentTarget)
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = tabs.length - 1
    if (next >= 0) {
      e.preventDefault()
      tabs[next].focus()
      tabs[next].click()
    }
  }
  return (
    <button
      role="tab"
      id={tabId(ctx.baseId, value)}
      aria-selected={active}
      aria-controls={panelId(ctx.baseId, value)}
      tabIndex={active ? 0 : -1} // Roving-Tabindex: nur der aktive Tab ist im Tab-Stop
      onKeyDown={onKey}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary text-primary-700"
          : "border-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700",
        className,
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabsContent must be inside Tabs")
  if (ctx.value !== value) return null
  return (
    <div
      role="tabpanel"
      id={panelId(ctx.baseId, value)}
      aria-labelledby={tabId(ctx.baseId, value)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}
