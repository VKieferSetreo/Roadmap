// Sanft hochzählende Kennzahl (RAF, easeOutCubic). Respektiert reduced-motion.
// T-359: ohne framer-motion (war ~30 KB gz eager im Main-Chunk für genau diese eine Zahl).

import { useEffect, useRef, useState } from "react"

interface AnimatedNumberProps {
  value: number
  /** Formatierung des Anzeigewerts (Default: de-DE Ganzzahl). */
  format?: (n: number) => string
  className?: string
}

const DURATION = 700 // ms

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("de-DE"))
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0) // aktueller Wert → bei value-Wechsel mitten in der Animation sauber weiteranimieren
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const from = displayRef.current
    if (reduced || from === value) {
      displayRef.current = value
      setDisplay(value)
      return
    }
    let start: number | null = null
    const tick = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / DURATION)
      const eased = 1 - (1 - p) ** 3 // easeOutCubic
      const cur = from + (value - from) * eased
      displayRef.current = cur
      setDisplay(cur)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return <span className={className}>{fmt(display)}</span>
}
