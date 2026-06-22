// #9: Vollbild-Karten-Picker für EINEN Wegpunkt (Start/Ziel/Zwischenpunkt). Oben Ortssuche
// (Nominatim, DE) → Karte fliegt hin; Pin per Klick setzen oder ziehen für die genaue Position.
// "Übernehmen" gibt {lat, lng, label} zurück — die Koordinate ist exakt (kein erneutes Geocoding).

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Loader2, MapPin, Search, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { api } from "@/api/roadmap"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { MapLayers } from "@/components/map/MapControls"
import { cn } from "@/lib/cn"

interface Pos {
  lat: number
  lng: number
}

interface Hit {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

const DE_CENTER: Pos = { lat: 51.1, lng: 10.4 }
const shortLabel = (display: string) => display.split(",").slice(0, 3).join(",").trim()
const pinIcon = L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%)"><svg width="32" height="32" viewBox="0 0 24 24" fill="#2f6f4e" stroke="#fff" stroke-width="1.5"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff" stroke="none"/></svg></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

/** Karte auf eine Position fliegen, wenn sie sich ändert (Suche/Erst-Öffnen). */
function FlyTo({ pos, zoom }: { pos: Pos | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.flyTo([pos.lat, pos.lng], zoom, { duration: 0.6 })
  }, [pos, zoom, map])
  return null
}

/** Klick auf die Karte setzt den Pin. */
function ClickToSet({ onSet }: { onSet: (p: Pos) => void }) {
  useMapEvents({ click: (e) => onSet({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Leaflet im (erst beim Öffnen sichtbaren) Modal korrekt einmessen. */
function Resizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => clearTimeout(t)
  }, [map])
  return null
}

export function MapPointPicker({
  open,
  title,
  initial,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  initial: (Pos & { label?: string }) | null
  onConfirm: (r: Pos & { label: string }) => void
  onClose: () => void
}) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]
  const [pos, setPos] = useState<Pos | null>(null)
  const [label, setLabel] = useState("")
  const [flyTo, setFlyTo] = useState<Pos | null>(null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [hi, setHi] = useState(-1) // markierter Treffer (Pfeiltasten)
  const [loading, setLoading] = useState(false)
  const skipNext = useRef(false)

  // Beim Öffnen mit der vorhandenen Position (falls gesetzt) starten.
  useEffect(() => {
    if (!open) return
    const start = initial ? { lat: initial.lat, lng: initial.lng } : null
    setPos(start)
    setLabel(initial?.label ?? "")
    setFlyTo(start)
    setQuery("")
    setHits([])
  }, [open, initial])

  // Debounced Nominatim-Suche (≥3 Zeichen, DE) — wie in PlaceAutocomplete.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    const term = query.trim()
    if (term.length < 3) {
      setHits([])
      return
    }
    setLoading(true)
    let stale = false
    const id = setTimeout(async () => {
      try {
        // #16: server-seitige Geocode-Suche (CSP blockt den direkten Nominatim-Fetch im Browser).
        const { results } = await api.geocodeSearch(term)
        if (!stale) {
          setHits(results as Hit[])
          setHi(-1)
        }
      } catch {
        /* offline / Fehler → still */
      } finally {
        if (!stale) setLoading(false)
      }
    }, 220) // kurzer Debounce → Vorschläge erscheinen schon bei kurzer Tipp-Pause (Max-Feedback)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [query])

  if (!open) return null

  const pickHit = (h: Hit) => {
    const p = { lat: Number(h.lat), lng: Number(h.lon) }
    skipNext.current = true
    setPos(p)
    setLabel(shortLabel(h.display_name))
    setFlyTo({ ...p }) // neues Objekt → FlyTo feuert auch bei gleicher Position erneut
    setQuery(shortLabel(h.display_name))
    setHits([])
    setHi(-1)
  }

  // #18: Enter im Suchfeld → markierten Treffer wählen (oder den ersten); sind noch keine Treffer
  // da (Tippen schneller als der Debounce), sofort einmal geokodieren und das erste Ergebnis nehmen.
  const submitSearch = async () => {
    if (hits.length > 0) {
      pickHit(hits[hi >= 0 ? hi : 0])
      return
    }
    const term = query.trim()
    if (term.length < 3) return
    try {
      const { results } = await api.geocodeSearch(term)
      if (results.length) pickHit(results[0] as Hit)
    } catch {
      /* still */
    }
  }

  const setPin = (p: Pos) => {
    setPos(p)
    // Manueller Pin → Koordinate als Label (Anzeige + exaktes Routing).
    setLabel(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`)
  }

  const confirm = () => {
    if (!pos) return
    onConfirm({ lat: pos.lat, lng: pos.lng, label: label || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-overlay">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
        <MapPin className="h-5 w-5 text-primary-600" />
        <h2 className="flex-1 text-sm font-semibold text-neutral-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Schließen" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative z-[1100] shrink-0 border-b border-neutral-100 px-4 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setHi((i) => Math.min(i + 1, hits.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setHi((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter") {
                e.preventDefault()
                void submitSearch()
              } else if (e.key === "Escape") {
                setHits([])
              }
            }}
            placeholder="Ort oder Adresse suchen …"
            className="pl-9"
          />
          {loading ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
          ) : null}
        </div>
        {hits.length > 0 ? (
          <ul className="absolute left-4 right-4 z-[2200] mt-1 max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
            {hits.map((h, i) => {
              const [head, ...rest] = h.display_name.split(",")
              return (
                <li key={h.place_id}>
                  <button
                    type="button"
                    onClick={() => pickHit(h)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100",
                      i === hi && "bg-neutral-100",
                    )}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span className="min-w-0">
                      <span className="font-medium text-neutral-800">{head}</span>
                      {rest.length ? <span className="block truncate text-xs text-neutral-400">{rest.join(",").trim()}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <MapContainer center={[(pos ?? DE_CENTER).lat, (pos ?? DE_CENTER).lng]} zoom={pos ? 14 : 6} className="h-full w-full" zoomControl>
          <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} />
          {tiles.overlays?.map((u) => (
            <TileLayer key={u} url={u} zIndex={2} />
          ))}
          <MapLayers />
          <Resizer />
          <FlyTo pos={flyTo} zoom={14} />
          <ClickToSet onSet={setPin} />
          {pos ? (
            <Marker
              position={[pos.lat, pos.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{ dragend: (e) => setPin(e.target.getLatLng()) }}
            />
          ) : null}
        </MapContainer>
        {!pos ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-neutral-900/80 px-3 py-1 text-xs text-white">
            Ort suchen oder auf die Karte klicken
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
        <span className="truncate text-xs text-neutral-500">
          {pos ? <>Gewählt: <span className="font-medium text-neutral-700">{label}</span></> : "Noch kein Punkt gesetzt"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={confirm} disabled={!pos}>Übernehmen</Button>
        </div>
      </footer>
      </div>
    </div>
  )
}
