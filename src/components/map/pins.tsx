/* eslint-disable react-refresh/only-export-components -- Icon-Fabrik (DivIcon-Factories),
   kein React-Komponenten-Modul; .tsx nur wegen JSX in renderToStaticMarkup. */
// Karten-Pin-Fabrik (Leaflet DivIcons) — EINHEITLICH für Routen- und DB-Karte:
// farbiger Tropfen (Severity rot/gelb · DB slate · eigen hellblau) → weißer Kreis →
// echtes StVO-Schild (von Max geliefert, signAssets.ts) mittig. Genutzt von RouteMap
// (via FindingMarker), FindingMapDialog und ObstaclesMap.

import L from "leaflet"
import { renderToStaticMarkup } from "react-dom/server"
import { MapPin as MapPinIcon } from "lucide-react"
import type { FindingKategorie } from "@/types/domain"
import { SIGN_DATA_URI } from "./signAssets"

// Einheitliche Pin-Geometrie: 36×42, Kopf-Center (18,16), Spitze unten (18,42).
const PIN_W = 36
const PIN_H = 42
const PIN_ANCHOR_X = 18
const PIN_ANCHOR_Y = 42
// Schild-Box im weißen Kreis (r=9.5): klein genug, dass auch Dreieck-Ecken NICHT
// über den Kreis ragen (Max-Wunsch). Zentriert auf den Kopf (18,16).
const SIGN_BOX = 11
const SIGN_X = 18 - SIGN_BOX / 2
const SIGN_Y = 16 - SIGN_BOX / 2

// Tropfen-Körper (Spitze unten bei 18,41) in der Pin-Farbe, weißer Rand.
const DROP_BODY = (color: string) =>
  `<path d="M18 2 C10 2 4 8 4 16 c0 11 13.6 24.5 13.7 24.6 a0.5 0.5 0 0 0 0.6 0 C18.4 40.5 32 27 32 16 c0 -8 -6 -14 -14 -14 z" fill="${color}" stroke="#ffffff" stroke-width="2"/>`

// StVO-Schild mittig im weißen Kreis (SIGN_BOX zentriert auf 18,16 → sitzt komplett innen).
function glyphHtml(kategorie: FindingKategorie): string {
  const uri = SIGN_DATA_URI[kategorie] ?? SIGN_DATA_URI.sonstige
  if (uri) {
    return `<image href="${uri}" x="${SIGN_X}" y="${SIGN_Y}" width="${SIGN_BOX}" height="${SIGN_BOX}" preserveAspectRatio="xMidYMid meet"/>`
  }
  // Fallback (sollte nie greifen): dunkler Pin-Glyph.
  return `<g transform="translate(10 8)">${renderToStaticMarkup(
    <MapPinIcon size={16} strokeWidth={2.2} color="#1f2937" />,
  )}</g>`
}

function pinSvg(color: string, kategorie: FindingKategorie, selected: boolean): string {
  // Schatten als gezeichnete Ellipse (kein CSS-Filter → flickerfrei beim Zoom/Pan).
  const groundShadow = `<ellipse cx="18" cy="40.5" rx="5" ry="1.7" fill="#00000026"/>`
  const ring = selected ? `<circle cx="18" cy="16" r="18" fill="${color}33"/>` : ""
  const whiteCircle = `<circle cx="18" cy="16" r="9.5" fill="#ffffff"/>`
  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${groundShadow}
    ${ring}
    ${DROP_BODY(color)}
    ${whiteCircle}
    ${glyphHtml(kategorie)}
  </svg>`
}

// DivIcons sind nur von (kategorie, color, selected) abhängig → cachen. Die DB-Karte
// rendert tausende Pins; ohne Cache liefe pro Pin ein teures renderToStaticMarkup.
const pinCache = new Map<string, L.DivIcon>()

export function findingPinIcon(
  kategorie: FindingKategorie,
  color: string,
  selected: boolean,
): L.DivIcon {
  const key = `${kategorie}|${color}|${selected ? 1 : 0}`
  const cached = pinCache.get(key)
  if (cached) return cached

  const icon = L.divIcon({
    className: "rm-pin",
    html: pinSvg(color, kategorie, selected),
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

// ── Ziel-Pin: Bullseye (konzentrische Kreise) ────────────────────────────────
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
