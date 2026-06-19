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

// Lazy-Chunk-Ladefehler: tritt auf, wenn während einer offenen Sitzung neu deployt wird
// (alte Chunks sind weg, der neue Code holt sie per dynamischem Import → schlägt fehl).
// Erkennung über die typischen Browser-Meldungen (Chrome/Firefox/Safari).
function isChunkLoadError(error: Error): boolean {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`
  return /ChunkLoadError|dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch dynamically/i.test(
    msg,
  )
}

export class ContentErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Stale-Chunk nach Deploy → einmal automatisch neu laden (holt frisches index.html +
    // alle aktuellen Chunks). sessionStorage-Drossel verhindert eine Reload-Schleife, falls
    // der Reload nicht hilft (dann bleibt die Fehlerseite stehen).
    if (isChunkLoadError(error)) {
      try {
        const KEY = "roadmap-chunk-reload-at"
        const last = Number(window.sessionStorage.getItem(KEY) || "0")
        if (Date.now() - last > 15_000) {
          window.sessionStorage.setItem(KEY, String(Date.now()))
          window.location.reload()
        }
      } catch {
        /* sessionStorage nicht verfügbar → Fehlerseite zeigen */
      }
    }
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
