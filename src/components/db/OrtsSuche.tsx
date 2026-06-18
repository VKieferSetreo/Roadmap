// Ortssuche (OSM Nominatim) für die Datenbank-Ansicht — als Header-Feld neben der
// Inhaltssuche (gleiche Optik/Größe). Liefert den Treffer per onSelect nach oben; die
// Karte fliegt dort über das flyTo-Prop hin (entkoppelt vom Leaflet-Overlay MapSearch).

import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, X } from "lucide-react"
import { Input } from "@/components/ui/Input"

interface NominatimHit {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox?: [string, string, string, string] // [south, north, west, east]
}

export interface OrtTreffer {
  lat: number
  lng: number
  bbox?: [number, number, number, number] // [south, north, west, east]
}

export function OrtsSuche({ onSelect }: { onSelect: (t: OrtTreffer) => void }) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<NominatimHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced Nominatim-Abfrage (Policy: ≤1 Req/s → 400ms Debounce, DE-beschränkt).
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=de&accept-language=de&q=" +
          encodeURIComponent(term)
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
        const data = (await res.json()) as NominatimHit[]
        setHits(Array.isArray(data) ? data : [])
        setOpen(true)
      } catch {
        /* abgebrochen / offline → still */
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q])

  // Klick ausserhalb schließt die Trefferliste.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const pick = (hit: NominatimHit) => {
    setOpen(false)
    setQ(hit.display_name.split(",")[0])
    const bb = hit.boundingbox
    onSelect({
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      bbox: bb ? [Number(bb[0]), Number(bb[1]), Number(bb[2]), Number(bb[3])] : undefined,
    })
  }

  return (
    <div ref={boxRef} className="relative">
      {loading ? (
        <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
      ) : (
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      )}
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) pick(hits[0])
          if (e.key === "Escape") setOpen(false)
        }}
        placeholder="Ort suchen …"
        className="pl-9"
        aria-label="Ort auf der Karte suchen"
      />
      {q ? (
        <button
          onClick={() => {
            setQ("")
            setHits([])
            setOpen(false)
          }}
          aria-label="Ortssuche leeren"
          title="Suche leeren"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-neutral-400 hover:text-neutral-700"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && hits.length > 0 ? (
        <ul className="absolute z-[1300] mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {hits.map((hit) => {
            const [head, ...rest] = hit.display_name.split(",")
            return (
              <li key={hit.place_id}>
                <button
                  type="button"
                  onClick={() => pick(hit)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
                >
                  <span className="font-medium text-neutral-800">{head}</span>
                  {rest.length ? (
                    <span className="block truncate text-xs text-neutral-400">{rest.join(",").trim()}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
