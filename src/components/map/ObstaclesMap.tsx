// Übersichtskarte der zentralen Hindernis-Datenbank: ALLES was wir haben, zoom- und
// schwenkbar. Pins in neutralem Ton (Hindernisse haben keine Severity — die entsteht
// erst bei der Bewertung gegen einen konkreten Transport).

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet"
import MarkerClusterGroup from "react-leaflet-cluster"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import { attrEntries, formatGueltigkeit, katMeta } from "@/components/project/findingMeta"
import { findingPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import type { Obstacle } from "@/types/domain"

const GERMANY: [number, number] = [51.1657, 10.4515]
const PIN_GLOBAL = "#475569" // Slate — globaler Setreo-/Connector-Bestand
const PIN_EIGEN = "#527121" // Setreo-Dunkelgrün — eigene Mandanten-Einträge

/** Eine Stammdaten-Zeile im Popup (Label links, Wert rechts). */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-neutral-400">{label}</span>
      <span className="text-right font-medium text-neutral-700">{value}</span>
    </div>
  )
}

export function ObstaclesMap({ obstacles }: { obstacles: Obstacle[] }) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <MapContainer center={GERMANY} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        {/* Clustering: bei zehntausenden Hindernissen würden Einzelmarker den Browser
            einfrieren. chunkedLoading fügt Marker häppchenweise hinzu (kein Block). */}
        <MarkerClusterGroup chunkedLoading maxClusterRadius={60} disableClusteringAtZoom={13}>
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
              <div className="min-w-[230px] max-w-[300px]">
                <p className="font-semibold text-neutral-900">{o.name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {katMeta(o.kategorie).label}
                  {o.strassenRef ? ` · ${o.strassenRef}` : ""}
                </p>
                {o.kiAufbereitet ? (
                  <span className="mt-1 inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    ✨ mit KI-Aufbereitung
                  </span>
                ) : null}
                {o.beschreibung ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{o.beschreibung}</p>
                ) : null}

                <div className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2 text-xs tabular-nums">
                  <DetailRow label="Gültig" value={formatGueltigkeit(o.gueltigVon, o.gueltigBis)} />
                  {attrEntries(o.attrs).map((e) => (
                    <DetailRow key={e.label} label={e.label} value={e.value} />
                  ))}
                  {o.zustaendig ? <DetailRow label="Zuständig" value={o.zustaendig} /> : null}
                  {o.fachId ? <DetailRow label="ID" value={o.fachId} /> : null}
                </div>

                {o.quelle?.name ? (
                  <p className="mt-2 border-t border-neutral-100 pt-1.5 text-[11px] text-neutral-400">
                    Quelle:{" "}
                    {o.quelle.url ? (
                      <a
                        href={o.quelle.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-600 underline"
                      >
                        {o.quelle.name}
                      </a>
                    ) : (
                      o.quelle.name
                    )}
                    {o.quelle.aktualisiertAm ? ` · ${o.quelle.aktualisiertAm}` : ""}
                  </p>
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
        </MarkerClusterGroup>
      </MapContainer>
      <span className="pointer-events-none absolute bottom-2 left-3 z-[500] rounded-md bg-white/85 px-2 py-1 text-[11px] tabular-nums text-neutral-600 backdrop-blur">
        {obstacles.length.toLocaleString("de-DE")} Hindernisse
      </span>
    </div>
  )
}
