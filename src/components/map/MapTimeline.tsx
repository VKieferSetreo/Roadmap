// Karten-Zeitstrahl (T-198): EIN kompakter Track mit Ticks, unten in der Karte.
// 1 Ball (ein Tag) oder per Button 2 Bälle (Zeitspanne) — beide auf demselben Strahl.
// Datum-Label über dem linken Punkt, unter dem rechten (bei einem Punkt darüber).
// Meldet das gewählte Fenster (ms) an die Karte; permanente Funde regelt der Aufrufer.
// ponytail: eigener Pointer-Slider statt nativer range — nötig für Ticks + Labels
// über/unter den Punkten auf einem Track. Tastatur (Pfeile) bleibt erhalten.
import { useEffect, useMemo, useRef, useState } from "react"
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
  const trackRef = useRef<HTMLDivElement>(null)

  const fmt = (idx: number) =>
    new Date(start0 + idx * DAY).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  const pct = (idx: number) => (days === 0 ? 0 : (idx / days) * 100)

  // Fenster melden (im 2-Ball-Modus ganze Tage inkl.).
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

  useEffect(() => () => onWindowChange(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  const valueFromClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round(ratio * days)
  }

  const startDrag = (which: "a" | "b") => (e: React.PointerEvent) => {
    e.preventDefault()
    const set = which === "a" ? setA : setB
    const onMove = (ev: PointerEvent) => set(valueFromClientX(ev.clientX))
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  // Klick auf den Track bewegt den nächstgelegenen Punkt dorthin.
  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current && (e.target as HTMLElement).dataset.handle) return
    const v = valueFromClientX(e.clientX)
    if (!dual || Math.abs(v - a) <= Math.abs(v - b)) setA(v)
    else setB(v)
  }

  const onKey = (which: "a" | "b") => (e: React.KeyboardEvent) => {
    const set = which === "a" ? setA : setB
    const cur = which === "a" ? a : b
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      set(Math.max(0, cur - 1))
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      set(Math.min(days, cur + 1))
    }
  }

  const ticks = Math.min(days, 12)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const fillL = dual ? pct(lo) : 0
  const fillR = dual ? pct(hi) : pct(a)

  const Handle = ({ which, value }: { which: "a" | "b"; value: number }) => (
    <div
      data-handle={which}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={days}
      aria-valuenow={value}
      aria-valuetext={fmt(value)}
      onPointerDown={startDrag(which)}
      onKeyDown={onKey(which)}
      style={{ left: `${pct(value)}%` }}
      className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-primary-600 bg-white shadow active:cursor-grabbing"
    />
  )

  // Label-Platzierung: linker (kleinerer) Punkt oben, rechter (größerer) unten.
  // Bei einem Punkt: oben.
  const label = (idx: number, where: "top" | "bottom") => {
    const p = pct(idx)
    // An den Enden bündig halten, damit das Label nicht über den Rand läuft.
    const tx = p < 12 ? "0" : p > 88 ? "-100%" : "-50%"
    return (
      <span
        style={{ left: `${p}%`, transform: `translateX(${tx})` }}
        className={cn(
          "pointer-events-none absolute whitespace-nowrap rounded bg-white/90 px-1 text-[10px] font-medium tabular-nums text-neutral-700 shadow-sm",
          where === "top" ? "top-0" : "bottom-0",
        )}
      >
        {fmt(idx)}
      </span>
    )
  }

  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-14 right-3 z-[600] flex h-12 items-center gap-2 rounded-lg px-2 shadow-lg">
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

      {/* Strahl + Ticks + Labels — nimmt die volle Pillenhöhe, Track mittig */}
      <div className="relative h-full flex-1">
        {/* Labels: einzel → oben; dual → kleiner Wert oben, größerer unten */}
        {dual ? (
          <>
            {label(lo, "top")}
            {label(hi, "bottom")}
          </>
        ) : (
          label(a, "top")
        )}

        {/* Track */}
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 cursor-pointer rounded-full bg-neutral-300"
        >
          {/* gefüllter Bereich */}
          <div
            className="absolute top-0 h-full rounded-full bg-primary-500"
            style={{ left: `${fillL}%`, right: `${100 - fillR}%` }}
          />
          {/* Ticks */}
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <span
              key={i}
              style={{ left: `${(i / ticks) * 100}%` }}
              className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-neutral-400/70"
            />
          ))}
          <Handle which="a" value={a} />
          {dual ? <Handle which="b" value={b} /> : null}
        </div>
      </div>
    </div>
  )
}
