// Übersichtskarte der zentralen Hindernis-Datenbank: ALLES was wir haben, zoom- und
// schwenkbar. Pins in neutralem Ton (Hindernisse haben keine Severity — die entsteht
// erst bei der Bewertung gegen einen konkreten Transport).

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { KATEGORIE_META } from "@/components/project/findingMeta"
import { findingPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import type { Obstacle } from "@/types/domain"

const GERMANY: [number, number] = [51.1657, 10.4515]
const PIN_GLOBAL = "#475569" // Slate — globaler Setreo-/Connector-Bestand
const PIN_EIGEN = "#527121" // Setreo-Dunkelgrün — eigene Mandanten-Einträge

/** Lesbare Kurzfassung der Grenzwerte. */
function attrsSummary(o: Obstacle): string {
  const num = (v: number | string | undefined) =>
    typeof v === "number" ? v.toLocaleString("de-DE") : v
  const parts: string[] = []
  if (o.attrs.maxHoeheM !== undefined) parts.push(`Höhe ≤ ${num(o.attrs.maxHoeheM)} m`)
  if (o.attrs.maxBreiteM !== undefined) parts.push(`Breite ≤ ${num(o.attrs.maxBreiteM)} m`)
  if (o.attrs.maxGewichtT !== undefined) parts.push(`Last ≤ ${num(o.attrs.maxGewichtT)} t`)
  if (o.attrs.maxAchslastT !== undefined) parts.push(`Achslast ≤ ${num(o.attrs.maxAchslastT)} t`)
  if (o.attrs.steigungPct !== undefined) parts.push(`Steigung ${num(o.attrs.steigungPct)} %`)
  if (o.attrs.radiusM !== undefined) parts.push(`Radius ${num(o.attrs.radiusM)} m`)
  if (o.attrs.restbreiteM !== undefined) parts.push(`Restbreite ${num(o.attrs.restbreiteM)} m`)
  return parts.join(" · ")
}

export function ObstaclesMap({ obstacles }: { obstacles: Obstacle[] }) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <MapContainer center={GERMANY} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        {obstacles.map((o) => (
          <Marker
            key={o.id}
            position={[o.lat, o.lng]}
            icon={findingPinIcon(
              o.kategorie,
              o.herkunft === "eigen" ? PIN_EIGEN : PIN_GLOBAL,
              false,
            )}
          >
            <Popup>
              <div className="min-w-[200px]">
                <p className="font-semibold text-neutral-900">{o.name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {KATEGORIE_META[o.kategorie].label}
                  {o.strassenRef ? ` · ${o.strassenRef}` : ""}
                  {o.fachId ? ` · ID ${o.fachId}` : ""}
                </p>
                {attrsSummary(o) ? (
                  <p className="mt-1.5 text-xs tabular-nums text-neutral-600">{attrsSummary(o)}</p>
                ) : null}
                {o.gueltigBis ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    gültig bis {o.gueltigBis.split("-").reverse().join(".")}
                  </p>
                ) : null}
                {o.zustaendig ? (
                  <p className="mt-1 text-xs text-neutral-500">{o.zustaendig}</p>
                ) : null}
                {o.herkunft === "eigen" ? (
                  <p className="mt-1.5 inline-block rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                    Eigener Eintrag
                  </p>
                ) : null}
                {o.demo ? (
                  <p className="mt-1.5 inline-block rounded-full border border-accent-400 bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-700">
                    Demo-Datensatz
                  </p>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <span className="pointer-events-none absolute bottom-2 left-3 z-[500] rounded-md bg-white/85 px-2 py-1 text-[11px] tabular-nums text-neutral-600 backdrop-blur">
        {obstacles.length.toLocaleString("de-DE")} Hindernisse
      </span>
    </div>
  )
}
