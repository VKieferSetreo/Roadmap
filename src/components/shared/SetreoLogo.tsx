import { useState } from "react"
import { cn } from "@/lib/cn"

interface SetreoLogoProps {
  /** height in px — Logo-Aspect 850×247. */
  height?: number
  className?: string
  /** "color" für white-BG, "white" für dark-BG. */
  variant?: "color" | "white"
}

export function SetreoLogo({ height = 28, className, variant = "color" }: SetreoLogoProps) {
  const [errored, setErrored] = useState(false)

  // Für dunkle Hintergründe Text-Wordmark statt invertiertes Raster-PNG.
  if (variant === "white") {
    return (
      <span
        className={cn("font-black leading-none tracking-tight text-white", className)}
        style={{ fontSize: Math.round(height * 0.85), letterSpacing: "-0.02em" }}
        aria-label="SETREO"
      >
        SETREO
      </span>
    )
  }

  if (errored) {
    return (
      <span
        className={cn("font-black leading-none tracking-tight text-primary-600", className)}
        style={{ fontSize: Math.round(height * 0.78), letterSpacing: "-0.02em" }}
        aria-label="SETREO"
      >
        SETREO
      </span>
    )
  }

  // BASE_URL ist Vite-aware. String-Konkatenation, damit der Pfad zur Build-Zeit korrekt prefixed wird.
  const logoSrc = `${import.meta.env.BASE_URL}setreo-logo.png`

  return (
    <img
      src={logoSrc}
      alt="Setreo"
      width={Math.round(height * (850 / 247))}
      height={height}
      style={{ height, width: "auto" }}
      className={cn("flex-shrink-0 select-none", className)}
      onError={() => setErrored(true)}
      draggable={false}
    />
  )
}
