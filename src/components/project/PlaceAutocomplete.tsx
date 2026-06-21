// Orts-/Adress-Autocomplete für Start/Ziel/Zwischenstopp — Vorschläge per OSM Nominatim
// (DE-beschränkt, 400 ms debounced, ≤1 Req/s-Policy). Auswahl füllt nur den Text; die
// eigentliche Geokodierung macht das Backend (resolveRoute) ohnehin nochmal (gecacht).
// autoComplete="off" unterdrückt zusätzlich die native Kontakt-Autofill des Browsers.

import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/Input"
import { api } from "@/api/roadmap"
import { cn } from "@/lib/cn"

interface Hit {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

/** Anzeige kürzen: die ersten 3 Komma-Teile (Ort, Kreis, Land reicht). */
const shortLabel = (display: string) =>
  display.split(",").slice(0, 3).join(",").trim()

export function PlaceAutocomplete({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hi, setHi] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const justPicked = useRef(false)

  // Debounced Nominatim-Suche (≥3 Zeichen, DE).
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false
      return // nach einer Auswahl nicht sofort wieder suchen
    }
    const term = value.trim()
    if (term.length < 3) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    let stale = false
    const id = setTimeout(async () => {
      try {
        // #16: server-seitige Geocode-Suche (CSP blockt den direkten Nominatim-Fetch).
        const { results } = await api.geocodeSearch(term)
        if (stale) return
        setHits(results as Hit[])
        setOpen(true)
        setHi(-1)
      } catch {
        /* offline / Fehler → still */
      } finally {
        if (!stale) setLoading(false)
      }
    }, 400)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [value])

  // Klick außerhalb schließt die Vorschlagsliste.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [])

  const pick = (h: Hit) => {
    justPicked.current = true
    onChange(shortLabel(h.display_name))
    setOpen(false)
    setHits([])
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
              setHi((i) => Math.min(i + 1, hits.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setHi((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter" && open && hi >= 0 && hits[hi]) {
              e.preventDefault()
              pick(hits[hi])
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          className="pr-8"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
        ) : null}
      </div>
      {open && hits.length > 0 ? (
        <ul className="absolute z-[1700] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {hits.map((h, i) => {
            const [head, ...rest] = h.display_name.split(",")
            return (
              <li key={h.place_id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(h)
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100",
                    i === hi && "bg-neutral-100",
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span className="min-w-0">
                    <span className="font-medium text-neutral-800">{head}</span>
                    {rest.length ? (
                      <span className="block truncate text-xs text-neutral-400">
                        {rest.join(",").trim()}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
