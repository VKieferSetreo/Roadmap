import { useMemo, useRef } from "react"
import { Minus, Plus } from "lucide-react"
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import {
  blockadeCounts,
  mockBlockades,
  mockInfra,
  mockRoutePolyline,
  mockRouteSummary,
  type Blockade,
  type InfraMarker as InfraMarkerT,
  type Severity,
} from "@/data/mockRoute"

const SEVERITY_COLOR: Record<Severity, { ring: string; bg: string; hex: string }> = {
  blocked: { ring: "ring-red-600", bg: "bg-red-500", hex: "#dc2626" },
  warning: { ring: "ring-amber-600", bg: "bg-amber-500", hex: "#d97706" },
  ok: { ring: "ring-emerald-600", bg: "bg-emerald-500", hex: "#16a34a" },
}

function severityIcon(severity: Severity): L.DivIcon {
  const c = SEVERITY_COLOR[severity]
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 28px; height: 28px; border-radius: 9999px;
        background: ${c.hex}; box-shadow: 0 0 0 3px white, 0 2px 6px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 700; font-size: 14px;
      ">!</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// Tunnel-Symbol als stilisierter Tunnel-Mund (Halbkreis-Eingang mit Bodenlinie) —
// kein passendes Emoji existiert (🚇 ist eine U-Bahn).
const TUNNEL_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 20 L3 12 C3 5.5, 21 5.5, 21 12 L21 20 Z" fill="#27272a"/>
  <path d="M7 20 L7 13 C7 9, 17 9, 17 13 L17 20 Z" fill="#ffffff"/>
  <rect x="2" y="19" width="20" height="2" fill="#27272a"/>
  <rect x="11" y="14" width="2" height="5" fill="#facc15"/>
</svg>`

// Brücken-Symbol — klassische Bogenbrücke mit Pfeilern, Wasserlinie und gelber Geländer-Linie.
// Klarer erkennbar als 🌉 (das ist eine japanische Brücke bei Nacht und wird klein zu undefinierbarem Pixelbrei).
const BRIDGE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 20 q2.5 -1.6 5 0 t5 0 t5 0 t5 0" stroke="#3b82f6" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <rect x="4" y="11" width="2" height="9" fill="#52525B"/>
  <rect x="18" y="11" width="2" height="9" fill="#52525B"/>
  <path d="M2 13 Q 12 3 22 13" stroke="#27272a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M3 12.3 Q 12 4 21 12.3" stroke="#facc15" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>`

const INFRA_GLYPH: Record<InfraMarkerT["kind"], string> = {
  bridge: BRIDGE_SVG,
  tunnel: TUNNEL_SVG,
  "height-limit": "↕",
  "weight-limit": "⚖",
}

function infraIcon(m: InfraMarkerT): L.DivIcon {
  // Für SVG-Glyphen: ohne padding/font-size; für Emoji-Glyphen: font-size setzen.
  const isSvg = INFRA_GLYPH[m.kind].startsWith("<svg")
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 28px; height: 28px; border-radius: 6px;
        background: white; border: 1px solid #d4d4d8;
        box-shadow: 0 1px 3px rgba(0,0,0,0.18);
        display: flex; align-items: center; justify-content: center;
        ${isSvg ? "" : "font-size: 15px; line-height: 1;"}
      ">${INFRA_GLYPH[m.kind]}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function endpointIcon(label: "A" | "B"): L.DivIcon {
  const bg = label === "A" ? "#87B52D" : "#dc2626"
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 28px; height: 28px; border-radius: 9999px;
        background: ${bg}; box-shadow: 0 0 0 3px white, 0 2px 6px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 800; font-size: 13px;
      ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

const ROUTE_BOUNDS = L.latLngBounds(
  mockRoutePolyline.map(([a, b]) => L.latLng(a, b)),
).pad(0.15)

export function RouteMap({
  selectedBlockadeId,
  onSelectBlockade,
}: {
  selectedBlockadeId?: string | null
  onSelectBlockade?: (id: string) => void
}) {
  const counts = useMemo(() => blockadeCounts(mockBlockades), [])
  const start = mockRoutePolyline[0]
  const end = mockRoutePolyline[mockRoutePolyline.length - 1]
  const mapRef = useRef<L.Map | null>(null)

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={mapRef}
        bounds={ROUTE_BOUNDS}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route-Polyline: weißer Schatten + dünnere primäre Linie */}
        <Polyline
          positions={mockRoutePolyline}
          pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
        />
        <Polyline
          positions={mockRoutePolyline}
          pathOptions={{ color: "#3F5520", weight: 5, opacity: 1 }}
        />

        {/* Start + Ziel */}
        <Marker position={start} icon={endpointIcon("A")}>
          <Tooltip direction="top" offset={[0, -10]}>
            Start · {mockRouteSummary.origin}
          </Tooltip>
        </Marker>
        <Marker position={end} icon={endpointIcon("B")}>
          <Tooltip direction="top" offset={[0, -10]}>
            Ziel · {mockRouteSummary.destination}
          </Tooltip>
        </Marker>

        {/* Infrastruktur-Marker (zuerst, damit Blockade-Pins drüber liegen) */}
        {mockInfra.map((m) => (
          <Marker key={m.id} position={m.position} icon={infraIcon(m)}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold text-neutral-900">{m.label}</div>
                {m.value ? <div className="text-neutral-500 mt-0.5">{m.value}</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Blockade-Marker */}
        {mockBlockades.map((b) => (
          <Marker
            key={b.id}
            position={b.position}
            icon={severityIcon(b.severity)}
            eventHandlers={{
              click: () => onSelectBlockade?.(b.id),
            }}
          >
            <Popup>
              <BlockadePopupBody blockade={b} selected={selectedBlockadeId === b.id} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Header über der Karte: Strecken-Zusammenfassung */}
      <div className="pointer-events-none absolute top-3 left-3 z-[1000]">
        <div className="pointer-events-auto rounded-md bg-white/95 backdrop-blur-sm border border-neutral-200 shadow-sm px-3 py-2 text-xs flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Strecke</span>
            <span className="font-semibold text-neutral-900 tabular-nums">
              {mockRouteSummary.distanceKm} km · {mockRouteSummary.durationH.toFixed(1)} h
            </span>
          </div>
          <span className="h-6 w-px bg-neutral-200" />
          <div className="flex items-center gap-1.5 text-neutral-700">
            {mockRouteSummary.via.map((v) => (
              <span
                key={v}
                className="inline-flex items-center px-1.5 h-5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold tracking-wide"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Rechte Steuer-Spalte: Legende oben, Zoom unten */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] flex flex-col items-end gap-2">
        <div className="pointer-events-auto rounded-md bg-white/95 backdrop-blur-sm border border-neutral-200 shadow-sm px-3 py-2 text-[11px] flex flex-col gap-1.5 min-w-[180px]">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-0.5">
            Legende
          </div>
          <LegendDot color="bg-red-500" label={`${counts.blocked} gesperrt`} />
          <LegendDot color="bg-amber-500" label={`${counts.warning} Warnung`} />
          <LegendDot color="bg-emerald-500" label={`${counts.ok} frei`} />
          <div className="h-px bg-neutral-100 my-1" />
          <LegendGlyph glyph={BRIDGE_SVG} label="Brücke" isHtml />
          <LegendGlyph glyph={TUNNEL_SVG} label="Tunnel" isHtml />
          <LegendGlyph glyph="↕" label="Höhenlimit" />
        </div>

        <div className="pointer-events-auto">
          <ZoomControl
            onZoomIn={() => mapRef.current?.zoomIn()}
            onZoomOut={() => mapRef.current?.zoomOut()}
          />
        </div>
      </div>
    </div>
  )
}

function ZoomControl({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  return (
    <div className="rounded-md bg-white/95 backdrop-blur-sm border border-neutral-200 shadow-sm overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Hineinzoomen"
        title="Hineinzoomen"
        className="h-8 w-8 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="h-px bg-neutral-200" />
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Herauszoomen"
        title="Herauszoomen"
        className="h-8 w-8 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-full ring-2 ring-white shadow ${color}`} />
      <span className="text-neutral-700">{label}</span>
    </div>
  )
}

function LegendGlyph({
  glyph,
  label,
  isHtml,
}: {
  glyph: string
  label: string
  isHtml?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-neutral-200 bg-white text-xs overflow-hidden">
        {isHtml ? (
          <span dangerouslySetInnerHTML={{ __html: glyph }} className="inline-flex" />
        ) : (
          glyph
        )}
      </span>
      <span className="text-neutral-700">{label}</span>
    </div>
  )
}

function BlockadePopupBody({ blockade, selected }: { blockade: Blockade; selected: boolean }) {
  return (
    <div className="text-xs min-w-[220px]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLOR[blockade.severity].bg}`} />
        <span className="font-semibold text-neutral-900">{blockade.category}</span>
      </div>
      <div className="text-neutral-500 mb-1">
        {blockade.road} · {blockade.km}
      </div>
      <div className="font-medium text-neutral-800">{blockade.title}</div>
      <div className="text-neutral-600 mt-1">{blockade.description}</div>
      {blockade.detail ? (
        <div className="mt-1.5 text-[10px] text-neutral-500 leading-snug">{blockade.detail}</div>
      ) : null}
      {selected ? (
        <div className="mt-1.5 text-[10px] text-primary-700 font-semibold">Ausgewählt</div>
      ) : null}
    </div>
  )
}
