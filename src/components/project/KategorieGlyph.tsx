// Einheitlicher Glyph-Renderer für Fund-Kategorien: zeigt das echte StVO-Schild
// (signAssets.ts) in einem weißen Kreis — deckungsgleich mit den Karten-Pins.
// Frontendweit verwendet: Karten-Legende, Dashboard-Liste, Detail-Overlay etc.

import type { FindingKategorie } from "@/types/domain"
import { SIGN_DATA_URI } from "@/components/map/signAssets"
import { katMeta } from "./findingMeta"
import { cn } from "@/lib/cn"

interface KategorieGlyphProps {
  kategorie: FindingKategorie
  /** Tailwind-Klassen für die Gesamtgröße (Default h-4 w-4). */
  className?: string
}

export function KategorieGlyph({ kategorie, className }: KategorieGlyphProps) {
  const uri = SIGN_DATA_URI[kategorie] ?? SIGN_DATA_URI.sonstige
  if (uri) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-neutral-200",
          className ?? "h-4 w-4",
        )}
        aria-hidden
      >
        <img src={uri} alt="" className="h-[80%] w-[80%] object-contain" />
      </span>
    )
  }
  // Fallback (sollte nie greifen — alle Kategorien haben ein Schild).
  const Icon = katMeta(kategorie).icon
  return <Icon className={cn("h-4 w-4", className)} />
}
