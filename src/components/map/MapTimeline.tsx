// Karten-Zeitstrahl (T-198): Balken über den Transport-Zeitraum, unten in der Karte.
// 1 Ball (ein Tag) oder per Button 2 Bälle (Zeitspanne). Meldet das gewählte Fenster (ms)
// an die Karte, die ihre Funde danach filtert. Permanente Funde (ohne Gültigkeit) bleiben
// immer sichtbar — das regelt der Aufrufer.
// ponytail: native <input type=range> statt Slider-Lib; im 2-Ball-Modus zwei gestapelte
// Slider (von/bis) statt überlappendem Dual-Range — robust und barrierearm.
import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CalendarRange } from "lucide-react"
import { cn } from "@/lib/cn"

const DAY = 86_400_000

function dayStart(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

interface MapTimelineProps {
  von: string
  bis: string
  onWindowChange: (win: { start: number; end: number } | null) => void
}

export function MapTimeline({ von, bis, onWindowChange }: MapTimelineProps) {
  const start0 = useMemo(() => dayStart(Date.parse(von)), [von])
  const days = useMemo(
    () => Math.max(1, Math.round((dayStart(Date.parse(bis)) - start0) / DAY)),
    [bis, start0],
  )
  const [dual, setDual] = useState(false)
  const [a, setA] = useState(0)
  const [b, setB] = useState(days)

  const fmt = (idx: number) =>
    new Date(start0 + idx * DAY).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

  // Fenster melden, sobald sich Modus/Positionen ändern (im 2-Ball-Modus ganze Tage inkl.).
  useEffect(() => {
    if (dual) {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      onWindowChange({ start: start0 + lo * DAY, end: start0 + hi * DAY + (DAY - 1) })
    } else {
      onWindowChange({ start: start0 + a * DAY, end: start0 + a * DAY + (DAY - 1) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dual, a, b, start0])

  // Filter aufheben, wenn der Zeitstrahl verschwindet.
  useEffect(() => () => onWindowChange(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-14 right-3 z-[600] rounded-lg px-3 py-2 shadow-lg">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDual((d) => !d)}
          title={dual ? "Auf Einzeltag umschalten" : "Auf Zeitspanne umschalten"}
          aria-label={dual ? "Auf Einzeltag umschalten" : "Auf Zeitspanne umschalten"}
          className={cn(
            "shrink-0 rounded-md border border-neutral-200 bg-white/80 p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100",
            dual && "text-primary-600",
          )}
        >
          {dual ? <CalendarRange className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={days}
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
            aria-label={dual ? "Zeitspanne von" : "Datum"}
            className="w-full accent-primary-600"
          />
          {dual ? (
            <input
              type="range"
              min={0}
              max={days}
              value={b}
              onChange={(e) => setB(Number(e.target.value))}
              aria-label="Zeitspanne bis"
              className="w-full accent-primary-600"
            />
          ) : null}
        </div>

        <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-neutral-700">
          {dual ? `${fmt(Math.min(a, b))} – ${fmt(Math.max(a, b))}` : fmt(a)}
        </span>
      </div>
    </div>
  )
}
