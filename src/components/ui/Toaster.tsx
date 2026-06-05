import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { Check, AlertCircle, Info, X } from "lucide-react"
import { cn } from "@/lib/cn"

type ToastKind = "success" | "info" | "warning" | "error"
interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void
}

const ToastCtx = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-md border bg-white shadow-lg px-3.5 py-2.5 min-w-[280px] max-w-md animate-slide-in-right",
              t.kind === "success" && "border-green-300",
              t.kind === "info" && "border-primary-300",
              t.kind === "warning" && "border-amber-300",
              t.kind === "error" && "border-red-300",
            )}
            role="status"
          >
            <div className="mt-0.5">
              {t.kind === "success" && <Check className="h-4 w-4 text-green-600" />}
              {t.kind === "info" && <Info className="h-4 w-4 text-primary-600" />}
              {t.kind === "warning" && <AlertCircle className="h-4 w-4 text-amber-600" />}
              {t.kind === "error" && <X className="h-4 w-4 text-red-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900">{t.title}</p>
              {t.description ? (
                <p className="text-xs text-neutral-600 mt-0.5">{t.description}</p>
              ) : null}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-neutral-400 hover:text-neutral-600"
              aria-label="Schließen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error("useToast must be inside ToastProvider")
  return ctx
}
