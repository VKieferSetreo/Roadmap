// Sanft hochzählende Kennzahl (framer-motion spring). Respektiert reduced-motion.

import { useEffect, useRef } from "react"
import { useReducedMotion, useSpring, useTransform, motion } from "framer-motion"

interface AnimatedNumberProps {
  value: number
  /** Formatierung des Anzeigewerts (Default: de-DE Ganzzahl). */
  format?: (n: number) => string
  className?: string
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduced = useReducedMotion()
  const spring = useSpring(reduced ? value : 0, { stiffness: 90, damping: 20 })
  const display = useTransform(spring, (v) =>
    (format ?? ((n: number) => Math.round(n).toLocaleString("de-DE")))(v),
  )
  const mounted = useRef(false)

  useEffect(() => {
    if (reduced) {
      spring.jump(value)
      return
    }
    if (!mounted.current) {
      mounted.current = true
      spring.set(value)
      return
    }
    spring.set(value)
  }, [value, spring, reduced])

  return <motion.span className={className}>{display}</motion.span>
}
