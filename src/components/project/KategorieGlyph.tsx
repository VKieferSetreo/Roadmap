// Ein einheitlicher Glyph-Renderer für Fund-Kategorien.
// Nutzt CUSTOM_KAT_SVG für Brücke/Tunnel und Lucide-Icons für alle anderen.
// Wird frontendweit verwendet: Karten-Pins, Dashboard-Liste, Detail-Overlay etc.

import type { FindingKategorie } from "@/types/domain"
import { CUSTOM_KAT_SVG, KATEGORIE_META } from "./findingMeta"
import { cn } from "@/lib/cn"

interface KategorieGlyphProps {
  kategorie: FindingKategorie
  /** Tailwind-Klassen für die Glyph-Größe (Default h-4 w-4). */
  className?: string
}

export function KategorieGlyph({ kategorie, className }: KategorieGlyphProps) {
  const custom = CUSTOM_KAT_SVG[kategorie]
  if (custom) {
    return (
      <span
        className={cn("inline-flex items-center justify-center h-4 w-4", className)}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: custom }}
      />
    )
  }
  const Icon = KATEGORIE_META[kategorie].icon
  return <Icon className={cn("h-4 w-4", className)} />
}
