// #15/#17: Auswahl-Maske für ein GeoPackage mit MEHREREN Strecken. Liste mit Mini-Vorschau je
// Strecke (wie beim Datei-Upload), Mehrfach-Auswahl per Checkbox, Suchleiste (bei vielen Strecken)
// und Alle-/Keine-Schalter. „Laden" legt die gewählten als einzelne Strecken an.

import { useMemo, useState } from "react"
import { Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { RoutePreview } from "./RoutePreview"
import { routeLengthKm } from "@/lib/parseRouteFile"
import type { GpkgRoute } from "@/lib/parseGpkg"

export function GpkgRouteSelectDialog({
  open,
  fileName,
  routes,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  fileName: string
  routes: GpkgRoute[]
  busy?: boolean
  onClose: () => void
  onConfirm: (selected: GpkgRoute[]) => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return routes.map((r, i) => ({ r, i })).filter(({ r }) => !q || r.name.toLowerCase().includes(q))
  }, [routes, query])

  if (!open) return null

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const allVisible = filtered.length > 0 && filtered.every(({ i }) => selected.has(i))
  const toggleAllVisible = () =>
    setSelected((s) => {
      const next = new Set(s)
      if (allVisible) filtered.forEach(({ i }) => next.delete(i))
      else filtered.forEach(({ i }) => next.add(i))
      return next
    })

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-overlay">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-900">Strecken aus GeoPackage wählen</h2>
            <p className="truncate text-xs text-neutral-400">
              {fileName} · {routes.length} Strecken gefunden
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Strecke suchen …" className="pl-9" autoComplete="off" />
          </div>
          <Button variant="ghost" size="sm" onClick={toggleAllVisible}>
            {allVisible ? "Keine" : "Alle"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">Keine Strecke gefunden.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map(({ r, i }) => {
                const on = selected.has(i)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition " +
                        (on ? "border-primary-400 bg-primary-50/50" : "border-neutral-200 hover:bg-neutral-50")
                      }
                    >
                      <span
                        className={
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white " +
                          (on ? "border-primary-500 bg-primary-500" : "border-neutral-300")
                        }
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="h-10 w-16 shrink-0 overflow-hidden rounded bg-neutral-50">
                        <RoutePreview points={r.points} color="#2f6f4e" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-800">{r.name}</span>
                        <span className="text-xs text-neutral-400">ca. {Math.round(routeLengthKm(r.points))} km · {r.points.length} Pkt.</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
          <span className="text-xs text-neutral-500">{selected.size} ausgewählt</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button onClick={() => onConfirm(routes.filter((_, i) => selected.has(i)))} disabled={busy || selected.size === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {selected.size > 0 ? `${selected.size} Strecke${selected.size === 1 ? "" : "n"} laden` : "Strecken laden"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
