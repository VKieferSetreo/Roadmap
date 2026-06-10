// Leaflet-Karte mit Route-Polyline + Form+Farb-codierten Fund-Markern.
// Form = Kategorie-Gruppe (Bauwerk, Physik, Baustelle, Verkehr), Farbe = Severity.

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import { renderToStaticMarkup } from "react-dom/server"
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import {
  Construction,
  Locate,
  MapPin as MapPinIcon,
  Minus,
  Mountain,
  MoveHorizontal,
  Plus,
  RotateCw,
  TrafficCone,
  TrainFront,
  TrendingUp,
  Weight,
  type LucideIcon,
} from "lucide-react"
import type { Finding, FindingKategorie, RoutePoint } from "@/types/domain"
import { KATEGORIE_META, SEVERITY_META } from "@/components/project/findingMeta"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { cn } from "@/lib/cn"

const GERMANY: [number, number] = [51.1657, 10.4515]

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

function findingPinIcon(kategorie: FindingKategorie, color: string, selected: boolean): L.DivIcon {
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

// ── Start-Pin: grüne Lokations-Marke mit MapPin-Glyph ────────────────────────
function startPinIcon(): L.DivIcon {
  const inner = renderToStaticMarkup(
    <MapPinIcon size={14} strokeWidth={2.6} color="white" fill="#87B52D" />,
  )
  const html = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));overflow:visible">
    <path d="M17 1.5C8.72 1.5 2 8.22 2 16.5c0 10.4 13 23.1 14.05 24.13a1.36 1.36 0 0 0 1.9 0C19 39.6 32 26.9 32 16.5 32 8.22 25.28 1.5 17 1.5Z"
          fill="#6A9221" stroke="#fff" stroke-width="2.5"/>
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
function endPinIcon(): L.DivIcon {
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

/** Passt den Kartenausschnitt an die Strecke an, sobald sie sich ändert. */
function FitBounds({ points, enabled }: { points: RoutePoint[]; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled || points.length < 2) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48] })
  }, [map, points, enabled])
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 80)
    return () => clearTimeout(id)
  }, [map])
  return null
}

interface RouteMapProps {
  geometry: RoutePoint[]
  findings: Finding[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
}

export function RouteMap({ geometry, findings, selectedId, onSelect, className }: RouteMapProps) {
  const tileStyle = useSettingsStore((s) => s.tileStyle)
  const autoFit = useSettingsStore((s) => s.autoFit)
  const tiles = TILE_LAYERS[tileStyle]
  const positions = useMemo(
    () => geometry.map((p) => [p.lat, p.lng] as [number, number]),
    [geometry],
  )
  const mapRef = useRef<L.Map | null>(null)

  const centerOnRoute = () => {
    if (!mapRef.current || positions.length < 2) return
    mapRef.current.fitBounds(L.latLngBounds(positions), { padding: [48, 48] })
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <MapContainer
        ref={mapRef}
        center={GERMANY}
        zoom={6}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer key={tiles.url} attribution={tiles.attribution} url={tiles.url} />

        {positions.length >= 2 ? (
          <>
            {/* Weißer Schatten unter der Route + farbige Linie für besseren Kontrast */}
            <Polyline
              positions={positions}
              pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
            />
            <Polyline
              positions={positions}
              pathOptions={{ color: "#527121", weight: 5, opacity: 1 }}
            />
            {/* Fahrtrichtungs-Fluss: animierte weiße Strichelung (CSS .route-flow) */}
            <Polyline
              positions={positions}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                opacity: 0.85,
                dashArray: "1 12",
                lineCap: "round",
                className: "route-flow",
              }}
            />
            <Marker position={positions[0]} icon={startPinIcon()}>
              <Popup>Start</Popup>
            </Marker>
            <Marker position={positions[positions.length - 1]} icon={endPinIcon()}>
              <Popup>Ziel</Popup>
            </Marker>
            <FitBounds points={geometry} enabled={autoFit} />
          </>
        ) : null}

        {findings.map((f) => {
          const meta = SEVERITY_META[f.severity]
          const kat = KATEGORIE_META[f.kategorie]
          return (
            <Marker
              key={f.id}
              position={[f.lat, f.lng]}
              icon={findingPinIcon(f.kategorie, meta.marker, selectedId === f.id)}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
              zIndexOffset={selectedId === f.id ? 1000 : 0}
            >
              <Popup>
                <div className="min-w-[190px]">
                  <p className="font-semibold text-neutral-900">{f.titel}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {kat.label} · km {f.km.toLocaleString("de-DE")}
                    {f.strassenRef ? ` · ${f.strassenRef}` : ""}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                    {f.beschreibung}
                  </p>
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      SEVERITY_META[f.severity].soft,
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        SEVERITY_META[f.severity].dot,
                      )}
                    />
                    {meta.label}
                  </span>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Map-Controls unten rechts: Zentrieren + Zoom +/− */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={centerOnRoute}
            aria-label="Auf Strecke zentrieren"
            title="Auf Strecke zentrieren"
            disabled={positions.length < 2}
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Locate className="h-4 w-4" />
          </button>
        </div>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Hineinzoomen"
            title="Hineinzoomen"
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px bg-neutral-200" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Herauszoomen"
            title="Herauszoomen"
            className="flex h-8 w-8 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
