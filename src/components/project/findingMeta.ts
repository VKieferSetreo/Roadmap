// Darstellungs-Metadaten für Fund-Kategorien und Schweregrade.
// Genutzt von Karte (Marker-Farben) und Dashboard (Badges/Icons).

import {
  Construction,
  Milestone,
  Mountain,
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
  bruecke: { label: "Brücke", icon: Milestone },
  tunnel: { label: "Tunnel", icon: Mountain },
  engstelle: { label: "Engstelle", icon: MoveHorizontal },
  gewicht: { label: "Gewicht", icon: Weight },
  kreisverkehr: { label: "Kreisverkehr", icon: RotateCw },
  baustelle: { label: "Baustelle", icon: Construction },
  bahnuebergang: { label: "Bahnübergang", icon: TrainFront },
  steigung: { label: "Steigung", icon: TrendingUp },
  ampel: { label: "Signalanlage", icon: TrafficCone },
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
