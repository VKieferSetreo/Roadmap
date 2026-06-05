import { createContext, useContext, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface TabsContextValue {
  value: string
  setValue: (v: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

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
  const current = value ?? internal
  const setValue = (v: string) => {
    if (onValueChange) onValueChange(v)
    else setInternal(v)
  }
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
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
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2",
        active
          ? "text-primary-700 border-primary"
          : "text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-50",
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
  return <div className={className}>{children}</div>
}
