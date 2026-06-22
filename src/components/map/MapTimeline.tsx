// Karten-Zeitstrahl (T-198): EIN schlanker Track mit Ticks, unten mittig in der Karte.
// 1 Ball (ein Tag) oder per Button 2 Bälle (Zeitspanne) auf demselben Strahl.
// Datum als schwebendes Tooltip über dem linken Punkt, unter dem rechten (einzeln: darüber).
// Meldet das gewählte Fenster (ms); permanente Funde regelt der Aufrufer.
// ponytail: eigener Pointer-Slider mit setPointerCapture (native range kann keine Ticks +
// Über/Unter-Labels auf einem Track). Handles INLINE gerendert — kein Remount mid-drag.
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
  // Default = Zeitspanne (erster bis letzter Tag) → initial sind ALLE Funde sichtbar; der
  // Nutzer engt nur bei Bedarf ein. dual ist lokaler UI-State (kein Persist) → gilt automatisch
  // auch für bestehende Projekte.
  const [dual, setDual] = useState(true)
  const [a, setA] = useState(0)
  const [b, setB] = useState(days)
  const [trackW, setTrackW] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const fmt = (idx: number) =>
    new Date(start0 + idx * DAY).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  const pct = (idx: number) => (days === 0 ? 0 : (idx / days) * 100)

  // T-243: ändert sich der Zeitraum (von/bis → days) ohne Remount, lagen a/b sonst außerhalb des
  // neuen Tracks → das gemeldete Zeitfenster zeigte über das Ende hinaus und filterte Funde falsch.
  // Bei jeder days-Änderung a/b in [0, days] klemmen.
  useEffect(() => {
    setA((p) => Math.min(Math.max(0, p), days))
    setB((p) => Math.min(Math.max(0, p), days))
  }, [days])

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

  // Track-Breite messen (für die Label-Kollision in px). Reagiert auf Resize/Fullscreen.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth))
    ro.observe(el)
    setTrackW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const valueFromClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * days)
  }
  const setWhich = (which: "a" | "b", v: number) => (which === "a" ? setA(v) : setB(v))

  // Drag über window-Listener (fängt jede Bewegung, auch außerhalb des kleinen Punkts).
  const onHandleDown = (which: "a" | "b") => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // T-325: pro pointermove löste ein setState die volle Funde-Neuberechnung im Parent aus. Auf
    // EIN Update je Frame drosseln (rAF, letzte Position gewinnt) — flüssig, ohne pro Pixel zu rechnen.
    let raf = 0
    let lastX = 0
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setWhich(which, valueFromClientX(lastX))
      })
    }
    const up = () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const onHandleKey = (which: "a" | "b", value: number) => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      setWhich(which, Math.max(0, value - 1))
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      setWhich(which, Math.min(days, value + 1))
    }
  }
  // Klick auf den Track (nicht auf einen Punkt) bewegt den nächstgelegenen Punkt dorthin.
  const onTrackDown = (e: React.PointerEvent) => {
    const v = valueFromClientX(e.clientX)
    if (!dual || Math.abs(v - a) <= Math.abs(v - b)) setA(v)
    else setB(v)
  }

  const lo = Math.min(a, b)
  const hi = Math.max(a, b)

  // Beide Datums-Labels liegen OBEN. Position in px (gemessene Track-Breite); bei
  // Überlappung werden sie symmetrisch auseinandergedrückt, sonst bündig am Rand geklemmt.
  const HALF = 28 // halbe Label-Breite (px), grob für "01.08.26"
  const SEP = 2 * HALF + 4 // Mindestabstand der Mittelpunkte
  const clampX = (x: number) => Math.max(HALF, Math.min(Math.max(HALF, trackW - HALF), x))
  const twoLabels = dual && lo !== hi
  let xLo = (pct(lo) / 100) * trackW
  let xHi = (pct(hi) / 100) * trackW
  if (twoLabels && xHi - xLo < SEP) {
    const mid = (xLo + xHi) / 2
    xLo = mid - SEP / 2
    xHi = mid + SEP / 2
    // Paar als Einheit in die Bounds schieben — Abstand bleibt erhalten.
    if (xLo < HALF) {
      xHi += HALF - xLo
      xLo = HALF
    }
    if (xHi > trackW - HALF) {
      xLo -= xHi - (trackW - HALF)
      xHi = trackW - HALF
    }
  }
  xLo = clampX(xLo)
  xHi = clampX(xHi)
  const labelCls =
    "pointer-events-none absolute bottom-full z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-white px-1.5 py-px text-[10px] font-semibold tabular-nums text-neutral-700 shadow ring-1 ring-black/5"
  const handleCls =
    "absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-primary-600 bg-white shadow-sm transition-transform hover:scale-125 active:scale-110 active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary-400"

  // Mehr Tage → mehr Ticks (dichter), aber die Pille bleibt gleich breit. Cap, damit
  // die Ticks bei sehr langen Zeiträumen nicht zum Vollbalken verschmelzen.
  const ticks = Math.min(days, 24)

  return (
    <div className="pointer-events-auto absolute bottom-3 left-14 z-[600] w-[min(380px,calc(100%-5rem))]">
      <div className="glass flex h-8 items-center gap-2 rounded-full px-2 shadow-lg">
        <button
          type="button"
          onClick={() => setDual((d) => !d)}
          title={dual ? "Einzeltag" : "Zeitspanne"}
          aria-label={dual ? "Auf Einzeltag umschalten" : "Auf Zeitspanne umschalten"}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-neutral-100",
            dual ? "text-primary-600" : "text-neutral-500",
          )}
        >
          {dual ? <CalendarRange className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
        </button>

        <div className="relative h-full flex-1">
          {/* Datums-Labels — beide oben; bei Überlappung auseinandergedrückt */}
          {twoLabels ? (
            <>
              <span style={{ left: `${xLo}px` }} className={labelCls}>{fmt(lo)}</span>
              <span style={{ left: `${xHi}px` }} className={labelCls}>{fmt(hi)}</span>
            </>
          ) : (
            <span style={{ left: `${clampX((pct(a) / 100) * trackW)}px` }} className={labelCls}>
              {fmt(a)}
            </span>
          )}

          {/* Track */}
          <div
            ref={trackRef}
            onPointerDown={onTrackDown}
            className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 cursor-pointer rounded-full bg-neutral-300/90"
          >
            {/* Füllbalken nur bei Zeitspanne — im Einzeltag-Modus zählt nur der Punkt. */}
            {dual ? (
              <div
                className="absolute top-0 h-full rounded-full bg-primary-500"
                style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
              />
            ) : null}
            {Array.from({ length: ticks + 1 }, (_, i) => (
              <span
                key={i}
                style={{ left: `${(i / ticks) * 100}%` }}
                className="absolute top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-400/60"
              />
            ))}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Datum"
              aria-valuemin={0}
              aria-valuemax={days}
              aria-valuenow={a}
              aria-valuetext={fmt(a)}
              style={{ left: `${pct(a)}%` }}
              onPointerDown={onHandleDown("a")}
              onKeyDown={onHandleKey("a", a)}
              className={handleCls}
            />
            {dual ? (
              <div
                role="slider"
                tabIndex={0}
                aria-label="Bis"
                aria-valuemin={0}
                aria-valuemax={days}
                aria-valuenow={b}
                aria-valuetext={fmt(b)}
                style={{ left: `${pct(b)}%` }}
                onPointerDown={onHandleDown("b")}
                onKeyDown={onHandleKey("b", b)}
                className={handleCls}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
