// Fehler-Grenze NUR um den Inhaltsbereich (Outlet). Crasht eine Seite, bleiben Header +
// Sidebar (alle Reiter + Mandanten-Dropdown) stehen — die App-Chrome geht nie verloren,
// man kann weiter navigieren / den Mandanten wechseln. Reset bei Routenwechsel (resetKey).

import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

interface Props {
  children: ReactNode
  /** Wechselt der Wert (z.B. Pathname/Mandant), wird der Fehlerzustand zurückgesetzt. */
  resetKey?: string
}
interface State {
  error: Error | null
}

export class ContentErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-severity-warnung-bg">
            <AlertTriangle className="h-6 w-6 text-severity-warnung" />
          </div>
          <h1 className="text-lg font-bold text-neutral-900">Diese Ansicht konnte nicht geladen werden</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Navigation und Mandantenwechsel funktionieren weiter — wähle links eine andere Ansicht
            oder versuche es erneut.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-700"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }
}
