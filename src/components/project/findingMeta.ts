// Darstellungs-Metadaten für Fund-Kategorien und Schweregrade.
// Genutzt von Karte (Marker-Glyphen), Dashboard (Badges/Icons) und Detail-Overlay.

import {
  Construction,
  MoveHorizontal,
  RotateCw,
  TrafficCone,
  TrainFront,
  TrendingUp,
  Weight,
  type LucideIcon,
} from "lucide-react"
import type { FindingKategorie, FindingSeverity } from "@/types/domain"
import type { BadgeProps } from "@/components/ui/Badge"

export const KATEGORIE_META: Record<FindingKategorie, { label: string; icon: LucideIcon }> = {
  // bruecke + tunnel haben CUSTOM-SVG (siehe CUSTOM_KAT_SVG unten) — das icon ist nur Fallback.
  bruecke: { label: "Brücke", icon: MoveHorizontal },
  tunnel: { label: "Tunnel", icon: MoveHorizontal },
  engstelle: { label: "Engstelle", icon: MoveHorizontal },
  gewicht: { label: "Gewicht", icon: Weight },
  kreisverkehr: { label: "Kreisverkehr", icon: RotateCw },
  baustelle: { label: "Baustelle", icon: Construction },
  bahnuebergang: { label: "Bahnübergang", icon: TrainFront },
  steigung: { label: "Steigung", icon: TrendingUp },
  ampel: { label: "Signalanlage", icon: TrafficCone },
}

/** Custom-SVG-Glyphen für Kategorien wo kein passendes Lucide-Icon existiert.
 *  stroke="currentColor" — Farbe wird vom umschließenden Element gesetzt.
 *  Wird sowohl in der Karte (Pins) als auch in Dashboard/Detail-Overlays verwendet. */
export const CUSTOM_KAT_SVG: Partial<Record<FindingKategorie, string>> = {
  // Brücke — Hängebrücke im Brooklyn-Bridge-Style.
  bruecke: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">
    <path d="M3 15 V6 Q5 9 7 6 V15"/>
    <path d="M17 15 V6 Q19 9 21 6 V15"/>
    <path d="M5 6 Q12 17 19 6"/>
    <path d="M9 10 V15"/>
    <path d="M12 12 V15"/>
    <path d="M15 10 V15"/>
    <path d="M2 15 H22"/>
    <path d="M8 15 V19"/>
    <path d="M16 15 V19"/>
  </svg>`,
  // Tunnel — Backsteinbogen-Portal (CH Signal 4.07 / Z 327).
  tunnel: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">
    <path d="M3 19 V12 Q3 4 12 4 Q21 4 21 12 V19"/>
    <path d="M6 12 Q6 7 12 7 Q18 7 18 12"/>
    <path d="M4 9 L6.5 10.2"/>
    <path d="M8 5 L9.5 7.4"/>
    <path d="M12 4 L12 7"/>
    <path d="M16 5 L14.5 7.4"/>
    <path d="M20 9 L17.5 10.2"/>
    <path d="M2 19 H22"/>
    <path d="M10.5 16.5 H13.5"/>
  </svg>`,
}

/** Hat die Kategorie einen Custom-SVG-Glyph statt eines Lucide-Icons? */
export function hasCustomGlyph(k: FindingKategorie): boolean {
  return CUSTOM_KAT_SVG[k] !== undefined
}

export const SEVERITY_META: Record<
  FindingSeverity,
  { label: string; badge: NonNullable<BadgeProps["variant"]>; marker: string; dot: string; rank: number }
> = {
  kritisch: { label: "Kritisch", badge: "danger", marker: "#DC2626", dot: "bg-red-600", rank: 0 },
  warnung: { label: "Warnung", badge: "warning", marker: "#EA580C", dot: "bg-orange-500", rank: 1 },
  hinweis: { label: "Hinweis", badge: "muted", marker: "#CA8A04", dot: "bg-yellow-600", rank: 2 },
}

export const SEVERITY_ORDER: FindingSeverity[] = ["kritisch", "warnung", "hinweis"]
