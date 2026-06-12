// Karten-Pin-Fabrik (Leaflet DivIcons): Form = Kategorie-Gruppe, Farbe = Severity.
// Eigenes Modul (kein Komponenten-Export) — genutzt von RouteMap, FindingMapDialog,
// ObstaclesMap.

import L from "leaflet"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Construction,
  MapPin as MapPinIcon,
  Mountain,
  MoveHorizontal,
  RotateCw,
  TrafficCone,
  TrainFront,
  TrendingUp,
  Weight,
  type LucideIcon,
} from "lucide-react"
import type { FindingKategorie } from "@/types/domain"

// ── Form-Gruppierung pro Kategorie ───────────────────────────────────────────
type PinShape = "drop" | "diamond" | "triangle" | "circle"

const SHAPE_BY_KATEGORIE: Record<FindingKategorie, PinShape> = {
  bruecke: "drop", // Bauwerk
  tunnel: "drop", // Bauwerk
  engstelle: "drop", // Bauwerk
  gewicht: "diamond", // physikalisch
  steigung: "diamond", // physikalisch
  baustelle: "triangle", // temporär / Achtung
  kreisverkehr: "circle", // Verkehrssteuerung
  ampel: "circle",
  bahnuebergang: "circle",
}

const ICON_BY_KATEGORIE: Record<FindingKategorie, LucideIcon> = {
  bruecke: Weight, // Brücke = max. Tragkraft im Vordergrund
  tunnel: Mountain,
  engstelle: MoveHorizontal,
  gewicht: Weight,
  steigung: TrendingUp,
  baustelle: Construction,
  kreisverkehr: RotateCw,
  ampel: TrafficCone,
  bahnuebergang: TrainFront,
}

/** Custom-Glyph für Kategorien wo kein passendes Lucide-Icon existiert.
 *  white-stroke / outline-Style passend zum Rest der Lucide-Icons. */
const CUSTOM_KAT_SVG: Partial<Record<FindingKategorie, string>> = {
  // Brücke — Hängebrücke im Brooklyn-Bridge-Style (zentriert in der viewBox):
  // zwei Pylonen mit konkav-bogenförmiger Aussparung oben, durchhängendes Hauptseil
  // (Kontrollpunkt tiefer → steilere Tangenten am Rand), drei vertikale Hängeseile,
  // horizontale Fahrbahn, zwei Stützpfeiler nach unten.
  // Alle y-Koords um +1 verschoben (Inhalt von y=6 bis y=19, Mitte ≈ 12.5 → mittiger im Pin).
  bruecke: `<svg width="19" height="19" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
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
  // Tunnel — angelehnt an CH Signal 4.07 / Z 327: Tunnelportal als BACKSTEIN-BOGEN
  // (Außen- + Innenkontur + radiale Steinfugen wie bei einem Mauerwerksbogen).
  tunnel: `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
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

function iconSvg(Icon: LucideIcon, size = 16): string {
  return renderToStaticMarkup(<Icon size={size} strokeWidth={2.3} color="white" />)
}

function iconHtmlForKategorie(kategorie: FindingKategorie): string {
  return CUSTOM_KAT_SVG[kategorie] ?? iconSvg(ICON_BY_KATEGORIE[kategorie])
}

// Einheitliche Pin-Geometrie: alle Forms 36×42, Hauptkörper-Center (18, 16),
// Anchor unten Mitte (18, 41). Glyph 16×16 zentriert. Form unterscheidet Kategorie-Gruppe.
const PIN_W = 36
const PIN_H = 42
const PIN_ANCHOR_X = 18
const PIN_ANCHOR_Y = 42

function pinShapeSvg(shape: PinShape, color: string, iconHtml: string, selected: boolean): string {
  const stroke = "#ffffff"
  const shadow = "drop-shadow(0 2px 3px rgba(0,0,0,.45))"
  const ring = selected ? `<circle cx="18" cy="16" r="18" fill="${color}33"/>` : ""

  // Standard-Glyph-Center innerhalb des Pin-Hauptkörpers (für Glyph-Boxgröße 16×16).
  // Triangle hat einen tieferen Schwerpunkt → Glyph weiter unten.
  const glyphTransform = shape === "triangle" ? "translate(10 14)" : "translate(10 8)"

  let shapeBody = ""
  switch (shape) {
    case "drop":
      // Tropfen (MapPin-Style) mit Spitze unten bei (18, 41).
      shapeBody = `<path d="M18 2 C10 2 4 8 4 16 c0 11 13.6 24.5 13.7 24.6 a0.5 0.5 0 0 0 0.6 0 C18.4 40.5 32 27 32 16 c0 -8 -6 -14 -14 -14 z"
                         fill="${color}" stroke="${stroke}" stroke-width="2"/>`
      break
    case "diamond":
      // Diamant (rotiertes abgerundetes Quadrat) bei (18, 16) + Stiel-Dreieck nach unten.
      shapeBody = `<path d="M18 41 L13.5 31 H22.5 Z" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
                   <rect x="7" y="5" width="22" height="22" rx="4" fill="${color}" stroke="${stroke}" stroke-width="2" transform="rotate(45 18 16)"/>`
      break
    case "triangle":
      // Achtungsdreieck (abgerundet) mit Spitze oben + Stiel-Dreieck nach unten.
      shapeBody = `<path d="M18 41 L13.5 31 H22.5 Z" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
                   <path d="M18 3 L32 28 a2.5 2.5 0 0 1 -2.2 3.7 H6.2 a2.5 2.5 0 0 1 -2.2 -3.7 Z"
                         fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`
      break
    case "circle":
      // Kreis bei (18, 16) + Stiel-Dreieck nach unten.
      shapeBody = `<path d="M18 41 L13.5 31 H22.5 Z" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
                   <circle cx="18" cy="16" r="13" fill="${color}" stroke="${stroke}" stroke-width="2"/>`
      break
  }

  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg" style="filter:${shadow};overflow:visible">
    ${ring}
    ${shapeBody}
    <g transform="${glyphTransform}">${iconHtml}</g>
  </svg>`
}

export function findingPinIcon(
  kategorie: FindingKategorie,
  color: string,
  selected: boolean,
): L.DivIcon {
  const shape = SHAPE_BY_KATEGORIE[kategorie]
  const html = pinShapeSvg(shape, color, iconHtmlForKategorie(kategorie), selected)
  return L.divIcon({
    className: "rm-pin",
    html,
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_ANCHOR_X, PIN_ANCHOR_Y],
    popupAnchor: [0, -PIN_H + 4],
  })
}

// ── Start-Pin: Lokations-Marke in der Strecken-Farbe ─────────────────────────
export function startPinIcon(farbe: string): L.DivIcon {
  const inner = renderToStaticMarkup(
    <MapPinIcon size={14} strokeWidth={2.6} color="white" fill={farbe} />,
  )
  const html = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));overflow:visible">
    <path d="M17 1.5C8.72 1.5 2 8.22 2 16.5c0 10.4 13 23.1 14.05 24.13a1.36 1.36 0 0 0 1.9 0C19 39.6 32 26.9 32 16.5 32 8.22 25.28 1.5 17 1.5Z"
          fill="${farbe}" stroke="#fff" stroke-width="2.5"/>
    <circle cx="17" cy="16" r="9" fill="#fff"/>
    <g transform="translate(10 9)">${inner}</g>
  </svg>`
  return L.divIcon({
    className: "rm-start-pin",
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  })
}

// ── Ziel-Pin: klares Bullseye-Symbol (konzentrische Kreise) ──────────────────
// Kein Karo-Muster mehr (wirkte verzerrt im runden Clipping).
export function endPinIcon(): L.DivIcon {
  const html = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));overflow:visible">
    <path d="M17 1.5C8.72 1.5 2 8.22 2 16.5c0 10.4 13 23.1 14.05 24.13a1.36 1.36 0 0 0 1.9 0C19 39.6 32 26.9 32 16.5 32 8.22 25.28 1.5 17 1.5Z"
          fill="#DC2626" stroke="#fff" stroke-width="2.5"/>
    <circle cx="17" cy="16" r="9" fill="#fff"/>
    <circle cx="17" cy="16" r="6.5" fill="#DC2626"/>
    <circle cx="17" cy="16" r="4" fill="#fff"/>
    <circle cx="17" cy="16" r="1.8" fill="#DC2626"/>
  </svg>`
  return L.divIcon({
    className: "rm-end-pin",
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  })
}
