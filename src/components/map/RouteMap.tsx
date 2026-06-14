// Leaflet-Karte mit Route-Polyline + Form+Farb-codierten Fund-Markern.
// Form = Kategorie-Gruppe (Bauwerk, Physik, Baustelle, Verkehr), Farbe = Severity.

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Building2, ExternalLink, Locate, Minus, Phone, Plus, User } from "lucide-react"
import type { Finding, ProjectRoute, RoutePoint } from "@/types/domain"
import {
  EIGEN_BADGE,
  EIGEN_COLOR,
  formatGueltigkeit,
  istEigenerEintrag,
  katMeta,
  SEVERITY_META,
} from "@/components/project/findingMeta"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { endPinIcon, findingPinIcon, startPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { geomToLines } from "@/lib/geom"
import { cn } from "@/lib/cn"

const GERMANY: [number, number] = [51.1657, 10.4515]

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
  /** sichtbare Strecken (Caller filtert ein-/ausgeblendete Ebenen vorab). */
  routes: ProjectRoute[]
  findings: Finding[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** wenn gesetzt: ein Klick DIREKT auf eine Strecke (nicht auf einen Fund-Pin)
   *  meldet die geklickte Position — fürs Anlegen eines Eintrags. */
  onRouteClick?: (p: RoutePoint) => void
  className?: string
}

export function RouteMap({
  routes,
  findings,
  selectedId,
  onSelect,
  onRouteClick,
  className,
}: RouteMapProps) {
  const tileStyle = useSettingsStore((s) => s.tileStyle)
  const autoFit = useSettingsStore((s) => s.autoFit)
  const tiles = TILE_LAYERS[tileStyle]
  const drawn = useMemo(
    () =>
      routes
        .filter((r) => r.points.length >= 2)
        .map((r) => ({
          ...r,
          positions: r.points.map((p) => [p.lat, p.lng] as [number, number]),
        })),
    [routes],
  )
  const allPoints = useMemo(() => drawn.flatMap((r) => r.points), [drawn])
  const mapRef = useRef<L.Map | null>(null)

  const centerOnRoute = () => {
    if (!mapRef.current || allPoints.length < 2) return
    mapRef.current.fitBounds(
      L.latLngBounds(allPoints.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48] },
    )
  }

  return (
    <div
      className={cn("relative h-full w-full", className)}
    >
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

        {drawn.map((r) => (
          /* je Strecke: weißer Schatten + Strecken-Farbe + Fahrtrichtungs-Fluss */
          <Polyline
            key={`bg-${r.id}`}
            positions={r.positions}
            pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
          />
        ))}
        {drawn.map((r) => (
          <Polyline
            key={`line-${r.id}`}
            positions={r.positions}
            pathOptions={{ color: r.farbe, weight: 5, opacity: 1 }}
          />
        ))}
        {drawn.map((r) => (
          <Polyline
            key={`flow-${r.id}`}
            positions={r.positions}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              opacity: 0.85,
              dashArray: "1 12",
              lineCap: "round",
              className: "route-flow",
            }}
          />
        ))}
        {/* Unsichtbare, breite Klick-Spur: Klick auf die Strecke → Eintrag-Maske.
            Liegt im overlayPane UNTER den Markern (markerPane) → Fund-Pins fangen
            ihre Klicks selbst ab, nur „freie" Strecken-Klicks lösen onRouteClick aus. */}
        {onRouteClick
          ? drawn.map((r) => (
              <Polyline
                key={`hit-${r.id}`}
                positions={r.positions}
                pathOptions={{
                  color: "#000000",
                  weight: 20,
                  opacity: 0,
                  className: "route-hit",
                  lineCap: "round",
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    onRouteClick({ lat: e.latlng.lat, lng: e.latlng.lng })
                  },
                }}
              />
            ))
          : null}

        {drawn.map((r) => (
          <Marker key={`start-${r.id}`} position={r.positions[0]} icon={startPinIcon(r.farbe)}>
            <Popup>Start — {r.name}</Popup>
          </Marker>
        ))}
        {drawn.map((r) => (
          <Marker
            key={`end-${r.id}`}
            position={r.positions[r.positions.length - 1]}
            icon={endPinIcon()}
          >
            <Popup>Ziel — {r.name}</Popup>
          </Marker>
        ))}
        {allPoints.length >= 2 ? <FitBounds points={allPoints} enabled={autoFit} /> : null}

        {/* Strecke, auf der ein Fund GREIFT (geom = Linie/MultiLineString), in der
            Severity-Farbe — weißes Casing darunter + Klick wählt den Fund. So sieht man
            die betroffene Strecke, nicht nur einen Punkt. */}
        {findings.flatMap((f) => {
          const lines = geomToLines(f.geom)
          if (lines.length === 0) return []
          const meta = SEVERITY_META[f.severity]
          const eigen = istEigenerEintrag(f.quelle)
          const color = eigen ? EIGEN_COLOR : meta.marker
          const active = selectedId === f.id
          return [
            <Polyline
              key={`fgeom-bg-${f.id}`}
              positions={lines}
              pathOptions={{ color: "#ffffff", weight: active ? 11 : 8, opacity: 0.85 }}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
            />,
            <Polyline
              key={`fgeom-${f.id}`}
              positions={lines}
              pathOptions={{
                color,
                weight: active ? 7 : 5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
            />,
          ]
        })}

        {findings.map((f) => {
          const meta = SEVERITY_META[f.severity]
          const kat = katMeta(f.kategorie)
          const routeColor = drawn.find((r) => r.id === f.routeId)?.farbe ?? "#71717A"
          // Eigene Einträge: Pin hellblau, unabhängig von der Severity.
          const eigen = istEigenerEintrag(f.quelle)
          const kontakt = eigen ? f.quelle?.kontakt : undefined
          return (
            <Marker
              key={f.id}
              position={[f.lat, f.lng]}
              icon={findingPinIcon(f.kategorie, eigen ? EIGEN_COLOR : meta.marker, selectedId === f.id)}
              eventHandlers={{ click: () => onSelect?.(f.id) }}
              zIndexOffset={selectedId === f.id ? 1000 : 0}
            >
              <Popup maxWidth={340} minWidth={300}>
                <div className="w-[300px] max-w-[78vw]">
                  {/* Kopf: Severity-Chip + Kategorie-Glyph + Titel */}
                  <div className="flex items-start gap-2.5">
                    <span className={cn("shrink-0 rounded-lg p-2", meta.chip)}>
                      <KategorieGlyph kategorie={f.kategorie} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{f.titel}</p>
                      <p className="text-xs text-neutral-500">
                        {kat.label} · km {f.km.toLocaleString("de-DE")}
                        {f.strassenRef ? ` · ${f.strassenRef}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {f.routeName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: routeColor }} />
                        {f.routeName}
                      </span>
                    ) : null}
                    {eigen ? (
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", EIGEN_BADGE)}>
                        Eigener Eintrag
                      </span>
                    ) : null}
                  </div>

                  {f.beschreibung ? (
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.beschreibung}</p>
                  ) : null}

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-neutral-200/70 pt-3 text-xs">
                    <div className="flex flex-col">
                      <dt className="text-neutral-400">Gültig</dt>
                      <dd className="font-medium tabular-nums text-neutral-800">
                        {formatGueltigkeit(f.gueltigVon, f.gueltigBis)}
                      </dd>
                    </div>
                    {Object.entries(f.detail).map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <dt className="text-neutral-400">{k}</dt>
                        <dd className="font-medium tabular-nums text-neutral-800">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {f.zustaendig ? (
                    <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-500">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      {f.zustaendig}
                    </p>
                  ) : null}

                  {/* Kontaktdaten bei eigenen Einträgen (Melder/Ansprechpartner/Telefon) */}
                  {kontakt && (kontakt.melder || kontakt.ansprechpartner || kontakt.telefon) ? (
                    <div className="mt-2.5 flex flex-col gap-1 rounded-lg bg-sky-50/70 px-2.5 py-2 text-xs text-neutral-600">
                      {kontakt.melder ? (
                        <p className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          <span className="text-neutral-400">Gemeldet von:</span> {kontakt.melder}
                        </p>
                      ) : null}
                      {kontakt.ansprechpartner ? (
                        <p className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          <span className="text-neutral-400">Ansprechpartner:</span> {kontakt.ansprechpartner}
                        </p>
                      ) : null}
                      {kontakt.telefon ? (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          <a href={`tel:${kontakt.telefon.replace(/\s+/g, "")}`} className="font-medium text-sky-700 hover:underline">
                            {kontakt.telefon}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        meta.soft,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                    {f.quelle?.name ? (
                      eigen || !f.quelle.url ? (
                        // Eigener Eintrag / ohne Link: Quelle als reiner Text (kein toter Link)
                        <span className="text-xs font-medium text-neutral-500">{f.quelle.name}</span>
                      ) : (
                        <a
                          href={f.quelle.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
                        >
                          {f.quelle.name} <ExternalLink className="h-3 w-3" />
                        </a>
                      )
                    ) : null}
                  </div>
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
            disabled={allPoints.length < 2}
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
