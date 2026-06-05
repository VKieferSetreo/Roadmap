// Generic Error-State für API-Fehler.
// Pattern: if (error) return <ErrorState error={error} onRetry={() => query.refetch()} />

import type { ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { ApiError } from "@/api/client"
import { cn } from "@/lib/cn"

interface ErrorStateProps {
  /** Beliebiger Error — ApiError wird mit code/requestId gerendert, sonst nur message. */
  error: unknown
  /** Wenn gesetzt: "Erneut versuchen"-Button rendert. */
  onRetry?: () => void
  /** Override-Title (default: "Verbindung fehlgeschlagen"). */
  title?: string
  /** Optionale zusätzliche Description-Lines (z.B. Hinweise). */
  hint?: ReactNode
  className?: string
}

export function ErrorState({
  error,
  onRetry,
  title = "Verbindung fehlgeschlagen",
  hint,
  className,
}: ErrorStateProps) {
  const message = formatError(error)
  const apiError = error instanceof ApiError ? error : null

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        "border-2 border-dashed border-red-200 rounded-lg bg-red-50/50",
        className,
      )}
      role="alert"
    >
      <div className="rounded-full bg-red-100 p-3 mb-3">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h3 className="font-semibold text-neutral-800">{title}</h3>
      <p className="text-sm text-red-700 mt-1 max-w-md">{message}</p>
      {apiError?.code ? (
        <p className="mt-1 text-[11px] text-neutral-500 font-mono">
          {apiError.code}
          {apiError.requestId ? ` · ${apiError.requestId}` : ""}
        </p>
      ) : null}
      {hint ? <div className="mt-3 text-xs text-neutral-600 max-w-md">{hint}</div> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Erneut versuchen
        </Button>
      ) : null}
    </div>
  )
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unbekannter Fehler"
}
