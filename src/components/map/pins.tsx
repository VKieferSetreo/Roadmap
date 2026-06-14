// Karten-Pin-Fabrik (Leaflet DivIcons): Form = Kategorie-Gruppe, Farbe = Severity.
// Eigenes Modul (kein Komponenten-Export) — genutzt von RouteMap, FindingMapDialog,
// ObstaclesMap.

import L from "leaflet"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Ban,
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
  sperrung: "triangle", // Sperrung / Achtung
  kreisverkehr: "circle", // Verkehrssteuerung
  ampel: "circle",
  bahnuebergang: "circle",
  sonstige: "circle", // sonstige Infrastruktur (kein Routen-Hindernis)
}

const ICON_BY_KATEGORIE: Record<FindingKategorie, LucideIcon> = {
  bruecke: Weight, // Brücke = max. Tragkraft im Vordergrund
  tunnel: Mountain,
  engstelle: MoveHorizontal,
  gewicht: Weight,
  steigung: TrendingUp,
  baustelle: Construction,
  sperrung: Ban,
  kreisverkehr: RotateCw,
  ampel: TrafficCone,
  bahnuebergang: TrainFront,
  sonstige: MapPinIcon,
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
  // Fallback-Icon, falls eine (neue/unbekannte) Kategorie kein Mapping hat —
  // sonst würde renderToStaticMarkup(<undefined/>) crashen (React #130).
  return CUSTOM_KAT_SVG[kategorie] ?? iconSvg(ICON_BY_KATEGORIE[kategorie] ?? MapPinIcon)
}

// Einheitliche Pin-Geometrie: alle Forms 36×42, Hauptkörper-Center (18, 16),
// Anchor unten Mitte (18, 41). Glyph 16×16 zentriert. Form unterscheidet Kategorie-Gruppe.
const PIN_W = 36
const PIN_H = 42
const PIN_ANCHOR_X = 18
const PIN_ANCHOR_Y = 42

function pinShapeSvg(shape: PinShape, color: string, iconHtml: string, selected: boolean): string {
  const stroke = "#ffffff"
  // Schatten als GEZEICHNETE Boden-Ellipse (kein CSS filter:drop-shadow):
  // ein CSS-Filter wird beim Zoom/Pan, wenn Leaflet den Marker-Pane transformiert,
  // pro Frame neu gerastert → Flackern / inkonsistente Sichtbarkeit (Max 2026-06-14,
  // Auswertungs-Karte, viele Pins). Eine gefüllte Ellipse ist reine Geometrie und wird
  // ohne Rasterungs-Schritt mit-transformiert → flickerfrei.
  const groundShadow = `<ellipse cx="18" cy="40.5" rx="5" ry="1.7" fill="#00000026"/>`
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

  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${groundShadow}
    ${ring}
    ${shapeBody}
    <g transform="${glyphTransform}">${iconHtml}</g>
  </svg>`
}

// ── Echte StVO-Schilder als Marker-Kopf ──────────────────────────────────────
// Statt eigener Glyphen zeigen wir das tatsächliche Verkehrsschild (Max 2026-06-14):
// rotes Warndreieck (Z123 Baustelle, Z120 Engstelle, Z131 Ampel, Z151 Bahnübergang,
// Z110 Steigung), rotes Rundverbot (Z250 Sperrung, Z262 Gewicht), blaues Gebotsschild
// (Z215 Kreisverkehr). Das Schild sitzt im Kopf des farbigen Pins — die Pin-Farbe trägt
// weiter die Severity (Hinweis gelb … Kritisch rot) bzw. Slate (DB) / Hellblau (eigen).
// Brücke/Tunnel/Sonstige haben kein StVO-Pendant → behalten ihren Custom-Glyph.
const STVO_RED = "#C1121F"
const STVO_DARK = "#1f2937"
const STVO_BLUE = "#1F5FAA"

/** Rotes Warndreieck (weißes Feld) mit Piktogramm — Lokalkoordinaten 20×20, Mitte (10,10). */
const warnTriangle = (picto: string) =>
  `<path d="M10 2.2 L18 18 H2 Z" fill="${STVO_RED}" stroke="${STVO_RED}" stroke-width="1.5" stroke-linejoin="round"/>
   <path d="M10 6 L15.2 15.4 H4.8 Z" fill="#ffffff" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round"/>
   ${picto}`

/** Rotes Rundverbot (weißes Feld, dicker roter Ring) mit Piktogramm. */
const prohibitCircle = (picto: string) =>
  `<circle cx="10" cy="10" r="8.6" fill="#ffffff"/>
   <circle cx="10" cy="10" r="8.6" fill="none" stroke="${STVO_RED}" stroke-width="2.8"/>
   ${picto}`

/** Blaues Gebotsschild (weißes Piktogramm). */
const infoCircle = (picto: string) =>
  `<circle cx="10" cy="10" r="9" fill="${STVO_BLUE}"/>
   ${picto}`

// Piktogramme (Lokalkoordinaten 20×20). Bei Dreiecken liegt der nutzbare Bereich unten-mittig.
const PICTO_BAUSTELLE = `<g fill="none" stroke="${STVO_DARK}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
   <circle cx="8" cy="8.8" r="1.05" fill="${STVO_DARK}" stroke="none"/>
   <path d="M7.7 10 L9.4 12.2"/><path d="M9.4 12.2 L13.2 9.3"/>
   <path d="M12.5 9.9 L14.3 8.4"/><path d="M12.3 10.3 L13.8 11.9"/>
   <path d="M8.6 12 L7.4 14.2"/><path d="M4.8 14.6 Q9.2 11.6 14 14.6" stroke-width="1.2"/></g>`
const PICTO_AMPEL = `<g><rect x="8.3" y="6.6" width="3.4" height="8" rx="1.3" fill="${STVO_DARK}"/>
   <circle cx="10" cy="8.3" r="0.72" fill="#fff"/><circle cx="10" cy="10.5" r="0.72" fill="#fff"/>
   <circle cx="10" cy="12.7" r="0.72" fill="#fff"/></g>`
const PICTO_BAHN = `<g fill="${STVO_DARK}"><rect x="5.4" y="9.4" width="7" height="3.4" rx="0.6"/>
   <rect x="9.2" y="7.2" width="2.6" height="2.6" rx="0.4"/><rect x="5.8" y="7.8" width="1.5" height="1.8"/>
   <circle cx="7.3" cy="13.4" r="1.05"/><circle cx="10.8" cy="13.4" r="1.05"/></g>`
const PICTO_STEIGUNG = `<g stroke="${STVO_DARK}" fill="none" stroke-linecap="round">
   <path d="M5 14 H15" stroke-width="1.1"/><path d="M5 14 L14.5 8.2" stroke-width="1.5"/></g>`
const PICTO_ENGSTELLE = `<g stroke="${STVO_DARK}" stroke-width="1.3" fill="none" stroke-linecap="round">
   <path d="M6.4 14.4 L9.1 7"/><path d="M13.6 14.4 L10.9 7"/></g>`
const PICTO_GEWICHT = `<text x="10" y="13.7" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9.5" font-weight="700" fill="${STVO_DARK}">t</text>`
const PICTO_KREISEL = `<g fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round">
   <path d="M10 5.7 a4.3 4.3 0 0 1 3.7 2.2"/><path d="M13.6 11.7 a4.3 4.3 0 0 1 -3.6 2.7"/>
   <path d="M6.5 11.9 a4.3 4.3 0 0 1 -0.1 -4.4"/></g>
   <g fill="#fff"><path d="M13.1 6 l1.5 1.4 -2 0.7 z"/><path d="M11.3 14.9 l-2 0.1 1.2 -1.7 z"/>
   <path d="M5.2 8.8 l0.4 -2 1.5 1.4 z"/></g>`

type StvoBuilder = () => string
const STVO_SIGN: Partial<Record<FindingKategorie, StvoBuilder>> = {
  baustelle: () => warnTriangle(PICTO_BAUSTELLE),
  engstelle: () => warnTriangle(PICTO_ENGSTELLE),
  ampel: () => warnTriangle(PICTO_AMPEL),
  bahnuebergang: () => warnTriangle(PICTO_BAHN),
  steigung: () => warnTriangle(PICTO_STEIGUNG),
  sperrung: () => prohibitCircle(""),
  gewicht: () => prohibitCircle(PICTO_GEWICHT),
  kreisverkehr: () => infoCircle(PICTO_KREISEL),
}

/** Pin mit echtem StVO-Schild im Kopf. Körper-Farbe = Severity/Slate/Eigen. */
function signPinSvg(kategorie: FindingKategorie, color: string, selected: boolean): string {
  const groundShadow = `<ellipse cx="18" cy="40.5" rx="5" ry="1.7" fill="#00000026"/>`
  const ring = selected ? `<circle cx="18" cy="16" r="18" fill="${color}33"/>` : ""
  // Tropfen-Körper (wie "drop") in der Severity-/Bestandsfarbe, Spitze unten bei (18,41).
  const body = `<path d="M18 2 C10 2 4 8 4 16 c0 11 13.6 24.5 13.7 24.6 a0.5 0.5 0 0 0 0.6 0 C18.4 40.5 32 27 32 16 c0 -8 -6 -14 -14 -14 z" fill="${color}" stroke="#ffffff" stroke-width="2"/>`
  // 20×20-Schild zentriert in den Kopf (Mitte 18,16): translate(8.5 6.5) scale(0.95).
  const sign = `<g transform="translate(8.5 6.5) scale(0.95)">${(STVO_SIGN[kategorie] as StvoBuilder)()}</g>`
  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${groundShadow}${ring}${body}${sign}
  </svg>`
}

// DivIcons sind nur von (kategorie, color, selected) abhängig → cachen. Die
// Hindernis-Übersichtskarte rendert tausende Pins; ohne Cache liefe pro Pin ein
// teures renderToStaticMarkup → Browser-Freeze. Eine DivIcon-Instanz darf von
// beliebig vielen Markern geteilt werden (Leaflet baut das DOM je Marker neu).
const pinCache = new Map<string, L.DivIcon>()

export function findingPinIcon(
  kategorie: FindingKategorie,
  color: string,
  selected: boolean,
): L.DivIcon {
  const key = `${kategorie}|${color}|${selected ? 1 : 0}`
  const cached = pinCache.get(key)
  if (cached) return cached

  // StVO-Kategorien → echtes Schild im Kopf; Brücke/Tunnel/Sonstige → Custom-Glyph.
  const html = STVO_SIGN[kategorie]
    ? signPinSvg(kategorie, color, selected)
    : pinShapeSvg(SHAPE_BY_KATEGORIE[kategorie] ?? "circle", color, iconHtmlForKategorie(kategorie), selected)
  const icon = L.divIcon({
    className: "rm-pin",
    html,
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_ANCHOR_X, PIN_ANCHOR_Y],
    popupAnchor: [0, -PIN_H + 4],
  })
  pinCache.set(key, icon)
  return icon
}

// ── Start-Pin: Lokations-Marke in der Strecken-Farbe ─────────────────────────
export function startPinIcon(farbe: string): L.DivIcon {
  const inner = renderToStaticMarkup(
    <MapPinIcon size={14} strokeWidth={2.6} color="white" fill={farbe} />,
  )
  // Schatten gezeichnet statt CSS-filter (sonst Flackern beim Zoom/Pan, s. pinShapeSvg).
  const html = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <ellipse cx="17" cy="40" rx="5" ry="1.7" fill="#00000026"/>
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
  const html = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <ellipse cx="17" cy="40" rx="5" ry="1.7" fill="#00000026"/>
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
