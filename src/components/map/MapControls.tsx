// Karten-Controls als react-leaflet-Kinder (laufen via useMap im MapContainer):
//  • MapSearch     — Ortssuche per OSM Nominatim, springt auf den Treffer.
//  • MapFullscreen — Vollbild der Karte (Fullscreen-API) mit Icon-Button.
// Beide unterbinden Click-/Scroll-Propagation, damit Tippen/Scrollen im Control die
// Karte nicht schwenkt oder zoomt.

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { useMap } from "react-leaflet"
import { Loader2, Map, Maximize2, Minimize2, Satellite, Search, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { useSettingsStore } from "@/store/settings"

/** Map-Events am Control-Root abklemmen (Leaflet greift sonst Klicks/Scroll ab). */
function useStopMapEvents<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  return ref
}

interface NominatimHit {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox?: [string, string, string, string] // [south, north, west, east]
}

// ── Ortssuche (Nominatim) ────────────────────────────────────────────────────
export function MapSearch() {
  const map = useMap()
  const rootRef = useStopMapEvents<HTMLDivElement>()
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<NominatimHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

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

  const goTo = (hit: NominatimHit) => {
    setOpen(false)
    setQ(hit.display_name.split(",")[0])
    const bb = hit.boundingbox
    if (bb) {
      map.fitBounds(
        L.latLngBounds([Number(bb[0]), Number(bb[2])], [Number(bb[1]), Number(bb[3])]),
        { padding: [40, 40], maxZoom: 15 },
      )
    } else {
      map.setView([Number(hit.lat), Number(hit.lon)], 14)
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-3 top-3 z-[1200] w-[min(20rem,calc(100%-5.5rem))]"
    >
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-2.5 shadow-md backdrop-blur-sm focus-within:border-primary-400">
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) goTo(hits[0])
            if (e.key === "Escape") setOpen(false)
          }}
          placeholder="Ort suchen …"
          aria-label="Ort suchen"
          className="h-9 w-full bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ("")
              setHits([])
              setOpen(false)
            }}
            aria-label="Suche leeren"
            className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && hits.length > 0 ? (
        <ul className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {hits.map((hit) => {
            const [head, ...rest] = hit.display_name.split(",")
            return (
              <li key={hit.place_id}>
                <button
                  type="button"
                  onClick={() => goTo(hit)}
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

// ── Vollbild ─────────────────────────────────────────────────────────────────
export function MapFullscreen() {
  const map = useMap()
  const rootRef = useStopMapEvents<HTMLDivElement>()
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    const onChange = () => {
      setIsFs(Boolean(document.fullscreenElement))
      // Container-Größe hat sich geändert → Leaflet neu vermessen.
      setTimeout(() => map.invalidateSize(), 60)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [map])

  const toggle = () => {
    // Den Karten-Wrapper (Eltern der leaflet-container) ins Vollbild → Controls + Badges bleiben.
    const target = map.getContainer().parentElement ?? map.getContainer()
    if (document.fullscreenElement) void document.exitFullscreen()
    else void target.requestFullscreen?.()
  }

  return (
    <div ref={rootRef} className="absolute right-3 top-3 z-[1200]">
      <button
        type="button"
        onClick={toggle}
        aria-label={isFs ? "Vollbild verlassen" : "Vollbild"}
        title={isFs ? "Vollbild verlassen" : "Vollbild"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white/95 text-neutral-600 shadow-md backdrop-blur-sm transition-colors hover:text-primary-600",
        )}
      >
        {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Kartenebene: Toggle Satellit ↔ Straßenkarte ──────────────────────────────
/** Ein-Klick-Umschalter zwischen Straßenkarte und Satellit. Das Icon zeigt das ZIEL
 *  (Satellit-Icon = „auf Satellit umschalten", Karten-Icon = „zurück zur Straßenkarte").
 *  Präsentationskomponente — frei im Wrapper (RouteMap) oder via MapLayers als Karten-Kind. */
export function LayerSwitcher({ buttonClassName }: { buttonClassName?: string }) {
  const tileStyle = useSettingsStore((s) => s.tileStyle)
  const setTileStyle = useSettingsStore((s) => s.setTileStyle)
  const isSat = tileStyle === "satellit"
  return (
    <button
      type="button"
      onClick={() => setTileStyle(isSat ? "standard" : "satellit")}
      aria-label={isSat ? "Zur Straßenkarte wechseln" : "Zur Satellitenansicht wechseln"}
      title={isSat ? "Straßenkarte" : "Satellit"}
      className={
        buttonClassName ??
        "flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white/95 text-neutral-600 shadow-md backdrop-blur-sm transition-colors hover:text-primary-600"
      }
    >
      {isSat ? <Map className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
    </button>
  )
}

/** LayerSwitcher als react-leaflet-Kind (für Karten mit MapContainer-Children).
 *  Default-Position oben rechts; via className überschreibbar. */
export function MapLayers({ className }: { className?: string }) {
  const rootRef = useStopMapEvents<HTMLDivElement>()
  return (
    <div ref={rootRef} className={cn("absolute z-[1200]", className ?? "right-3 top-3")}>
      <LayerSwitcher />
    </div>
  )
}
