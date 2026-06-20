// Top-Level Error-Boundary: fängt Render-Fehler und zeigt eine freundliche
// Recovery-Oberfläche statt eines weißen Bildschirms.

import { Component, type ErrorInfo, type ReactNode } from "react"
import * as Sentry from "@sentry/react"
import { RefreshCcw, TriangleAlert } from "lucide-react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Roadmap] Unbehandelter Render-Fehler:", error, info.componentStack)
    // T-468: an GlitchTip melden (no-op ohne DSN, Sentry.init lief in main.tsx).
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-severity-kritisch-bg">
            <TriangleAlert className="h-6 w-6 text-severity-kritisch" />
          </div>
          <h1 className="text-lg font-bold text-neutral-900">Da ist etwas schiefgelaufen</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Die Anwendung ist auf einen unerwarteten Fehler gestoßen. Neu laden behebt das in den
            meisten Fällen.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <RefreshCcw className="h-4 w-4" /> Seite neu laden
          </button>
          <p className="mt-4 font-mono text-[11px] text-neutral-400">{this.state.error.message}</p>
        </div>
      </div>
    )
  }
}
