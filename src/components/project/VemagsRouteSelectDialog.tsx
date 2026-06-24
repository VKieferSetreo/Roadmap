// T-567: Auswahl-Maske für einen VEMAGS-Bescheid mit mehreren Fahrtwegteilen — analog zur
// GeoPackage-Maske. Liste mit Mini-Vorschau je Fahrtwegteil, Leer-/Lastfahrt-Badge, km/Wegpunkte,
// Hinweis auf übersprungene Wegpunkte. Mehrfach-Auswahl; „Laden" legt die gewählten als Strecken an.
// Die Transport-Maße aus dem Bescheid werden beim Laden in die Stammdaten übernommen.

import { useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { RoutePreview } from "./RoutePreview"
import type { VemagsResult } from "@/api/roadmap"

type Strecke = VemagsResult["strecken"][number]

export function VemagsRouteSelectDialog({
  open,
  fileName,
  result,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  fileName: string
  result: VemagsResult | null
  busy?: boolean
  onClose: () => void
  onConfirm: (selected: Strecke[]) => void
}) {
  const strecken = result?.strecken ?? []
  // Nur ladbare Fahrtwegteile (≥2 Wegpunkte) sind wählbar; Standard: alle vorausgewählt.
  const ladbar = useMemo(
    () => (result?.strecken ?? []).map((s, i) => ({ s, i })).filter(({ s }) => s.points.length >= 2),
    [result],
  )
  const [selected, setSelected] = useState<Set<number>>(() => new Set(ladbar.map(({ i }) => i)))

  if (!open || !result) return null

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const allOn = ladbar.length > 0 && ladbar.every(({ i }) => selected.has(i))
  const toggleAll = () =>
    setSelected(() => (allOn ? new Set() : new Set(ladbar.map(({ i }) => i))))

  const { laengeM, breiteM, hoeheM, masseT } = result.spec
  const masse = [laengeM && `L ${laengeM} m`, breiteM && `B ${breiteM} m`, hoeheM && `H ${hoeheM} m`, masseT && `${masseT} t`].filter(Boolean).join(" · ")

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-overlay">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-900">Fahrtwegteile aus VEMAGS-Bescheid wählen</h2>
            <p className="truncate text-xs text-neutral-400">
              {fileName} · {strecken.length} Fahrtwegteil{strecken.length === 1 ? "" : "e"}
              {masse ? ` · Maße: ${masse}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
          <span className="text-xs text-neutral-500">Lastfahrt = eigentlicher Transport, Leerfahrten = An-/Abfahrt.</span>
          <Button variant="ghost" size="sm" onClick={toggleAll} disabled={ladbar.length === 0}>
            {allOn ? "Keine" : "Alle"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ul className="flex flex-col gap-2">
            {strecken.map((s, i) => {
              const ladefehler = s.points.length < 2
              const on = selected.has(i)
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={ladefehler}
                    onClick={() => toggle(i)}
                    className={
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition " +
                      (ladefehler
                        ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60"
                        : on
                          ? "border-primary-400 bg-primary-50/50"
                          : "border-neutral-200 hover:bg-neutral-50")
                    }
                  >
                    <span
                      className={
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white " +
                        (on && !ladefehler ? "border-primary-500 bg-primary-500" : "border-neutral-300")
                      }
                    >
                      {on && !ladefehler ? "✓" : ""}
                    </span>
                    <span className="h-10 w-16 shrink-0 overflow-hidden rounded bg-neutral-50">
                      {!ladefehler ? <RoutePreview points={s.points} color="#2f6f4e" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-neutral-800">{s.name}</span>
                        <span
                          className={
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold " +
                            (s.istLastfahrt ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-500")
                          }
                        >
                          {s.istLastfahrt ? "Lastfahrt" : "Leerfahrt"}
                        </span>
                      </span>
                      <span className="block text-xs text-neutral-400">
                        {ladefehler
                          ? (s.fehler ?? "Nicht rekonstruierbar.")
                          : `ca. ${Math.round(s.distanzKm)} km · ${s.wegpunkte ?? s.points.length} Wegpunkte` +
                            (s.grob ? " · grobe Schätzung" : "")}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
          <span className="text-xs text-neutral-500">{selected.size} ausgewählt · Maße werden übernommen</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button onClick={() => onConfirm(strecken.filter((_, i) => selected.has(i)))} disabled={busy || selected.size === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {selected.size > 0 ? `${selected.size} Strecke${selected.size === 1 ? "" : "n"} laden` : "Strecken laden"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
