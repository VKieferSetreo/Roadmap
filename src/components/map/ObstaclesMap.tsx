// Übersichtskarte der zentralen Hindernis-Datenbank: ALLES was wir haben, zoom- und
// schwenkbar. Pins in neutralem Ton (Hindernisse haben keine Severity — die entsteht
// erst bei der Bewertung gegen einen konkreten Transport); eigene Einträge hellblau.
//
// Das Cluster wird IMPERATIV über leaflet.markercluster aufgebaut (nicht über
// react-leaflet-cluster). Grund (Max 2026-06-14): bei der React-Children-Variante
// verschwanden beim Zoomen Marker und kamen nicht wieder — die Lib baute das Cluster
// bei jedem Reconcile neu. Imperativ wird das Cluster NUR bei Daten-Änderung gebaut;
// Zoom/Pan fasst die Marker nie an → Punkte bleiben persistent.

import { useEffect } from "react"
import L from "leaflet"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import {
  attrEntries,
  EIGEN_COLOR,
  formatGueltigkeit,
  istEigenerEintrag,
  katMeta,
} from "@/components/project/findingMeta"
import { findingPinIcon } from "./pins"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import { geomToLines } from "@/lib/geom"
import type { Obstacle } from "@/types/domain"

const GERMANY: [number, number] = [51.1657, 10.4515]
const PIN_GLOBAL = "#475569" // Slate — globaler Setreo-/Connector-Bestand

/** HTML-Escape für Feld-Inhalte aus externen Feeds (Popup-HTML-Injection vermeiden). */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Popup-HTML für ein Hindernis — spiegelt die frühere JSX-Variante (Tailwind global). */
function obstaclePopupHtml(o: Obstacle): string {
  const eigen = istEigenerEintrag(o.quelle)
  const kontakt = eigen ? o.quelle?.kontakt : undefined
  const rows: string[] = [
    `<div class="flex justify-between gap-3"><span class="shrink-0 text-neutral-400">Gültig</span><span class="text-right font-medium text-neutral-700">${esc(formatGueltigkeit(o.gueltigVon, o.gueltigBis))}</span></div>`,
    ...attrEntries(o.attrs).map(
      (e) =>
        `<div class="flex justify-between gap-3"><span class="shrink-0 text-neutral-400">${esc(e.label)}</span><span class="text-right font-medium text-neutral-700">${esc(e.value)}</span></div>`,
    ),
  ]
  if (o.zustaendig)
    rows.push(
      `<div class="flex justify-between gap-3"><span class="shrink-0 text-neutral-400">Zuständig</span><span class="text-right font-medium text-neutral-700">${esc(o.zustaendig)}</span></div>`,
    )
  if (o.fachId)
    rows.push(
      `<div class="flex justify-between gap-3"><span class="shrink-0 text-neutral-400">ID</span><span class="text-right font-medium text-neutral-700">${esc(o.fachId)}</span></div>`,
    )

  const kontaktZeilen: string[] = []
  if (kontakt?.melder)
    kontaktZeilen.push(`<p><span class="text-neutral-400">Gemeldet von:</span> ${esc(kontakt.melder)}</p>`)
  if (kontakt?.ansprechpartner)
    kontaktZeilen.push(`<p><span class="text-neutral-400">Ansprechpartner:</span> ${esc(kontakt.ansprechpartner)}</p>`)
  if (kontakt?.telefon)
    kontaktZeilen.push(
      `<p><span class="text-neutral-400">Telefon:</span> <a href="tel:${esc(kontakt.telefon.replace(/\s+/g, ""))}" class="font-medium text-sky-700">${esc(kontakt.telefon)}</a></p>`,
    )

  const quelleHtml = o.quelle?.name
    ? eigen || !o.quelle.url
      ? esc(o.quelle.name)
      : `<a href="${esc(o.quelle.url)}" target="_blank" rel="noreferrer" class="text-primary-600 underline">${esc(o.quelle.name)}</a>`
    : ""

  return `<div class="min-w-[230px] max-w-[300px]">
    <p class="font-semibold text-neutral-900">${esc(o.name)}</p>
    <p class="mt-0.5 text-xs text-neutral-500">${esc(katMeta(o.kategorie).label)}${o.strassenRef ? ` · ${esc(o.strassenRef)}` : ""}</p>
    ${o.kiAufbereitet ? `<span class="mt-1 inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">✨ mit KI-Aufbereitung</span>` : ""}
    ${o.beschreibung ? `<p class="mt-1.5 text-xs leading-relaxed text-neutral-600">${esc(o.beschreibung)}</p>` : ""}
    <div class="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2 text-xs tabular-nums">${rows.join("")}</div>
    ${kontaktZeilen.length ? `<div class="mt-2 flex flex-col gap-1 rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-xs text-neutral-600">${kontaktZeilen.join("")}</div>` : ""}
    ${quelleHtml ? `<p class="mt-2 border-t border-neutral-100 pt-1.5 text-[11px] text-neutral-400">Quelle: ${quelleHtml}${o.quelle?.aktualisiertAm ? ` · ${esc(o.quelle.aktualisiertAm)}` : ""}</p>` : ""}
    ${eigen ? `<p class="mt-1.5 inline-block rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">Eigener Eintrag</p>` : ""}
    ${o.demo ? `<p class="mt-1.5 inline-block rounded-full border border-accent-400 bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-700">Demo-Datensatz</p>` : ""}
  </div>`
}

/** Baut das markercluster-Layer imperativ; Rebuild NUR bei Daten-Änderung (nicht bei Zoom). */
function ObstacleClusterLayer({ obstacles }: { obstacles: Obstacle[] }) {
  const map = useMap()
  useEffect(() => {
    // leaflet.markercluster erweitert L zur Laufzeit (kein @types-Paket) → lose getypt.
    const cluster = (L as unknown as { markerClusterGroup: (o: unknown) => L.LayerGroup }).markerClusterGroup({
      chunkedLoading: true, // Marker häppchenweise hinzufügen → kein Browser-Freeze
      maxClusterRadius: 60,
      disableClusteringAtZoom: 13,
    })
    for (const o of obstacles) {
      const eigen = istEigenerEintrag(o.quelle)
      const marker = L.marker([o.lat, o.lng], {
        icon: findingPinIcon(o.kategorie, eigen ? EIGEN_COLOR : PIN_GLOBAL, false),
      })
      marker.bindPopup(() => obstaclePopupHtml(o), { maxWidth: 320, minWidth: 240 })
      cluster.addLayer(marker)
    }
    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
    }
  }, [map, obstacles])
  return null
}

/** Strecken-Geometrie (geom = Linie/MultiLineString) als Polylines — die betroffene
 *  Strecke statt nur ein Punkt. Eigene Ebene (NICHT geclustert), unter den Markern;
 *  Rebuild nur bei Daten-Änderung. */
function ObstacleLinesLayer({ obstacles }: { obstacles: Obstacle[] }) {
  const map = useMap()
  useEffect(() => {
    const group = L.layerGroup()
    for (const o of obstacles) {
      const lines = geomToLines(o.geom)
      if (lines.length === 0) continue
      const color = istEigenerEintrag(o.quelle) ? EIGEN_COLOR : PIN_GLOBAL
      // weißes Casing für Lesbarkeit über den Tiles + farbige Strecke darüber
      L.polyline(lines, { color: "#ffffff", weight: 6, opacity: 0.7 }).addTo(group)
      const line = L.polyline(lines, { color, weight: 3.5, opacity: 0.9, lineCap: "round" })
      line.bindPopup(() => obstaclePopupHtml(o), { maxWidth: 320, minWidth: 240 })
      line.addTo(group)
    }
    group.addTo(map)
    return () => {
      map.removeLayer(group)
    }
  }, [map, obstacles])
  return null
}

export function ObstaclesMap({ obstacles }: { obstacles: Obstacle[] }) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <MapContainer center={GERMANY} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        {/* Linien zuerst (unter den Markern), dann das Cluster */}
        <ObstacleLinesLayer obstacles={obstacles} />
        <ObstacleClusterLayer obstacles={obstacles} />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-2 left-3 z-[500] rounded-md bg-white/85 px-2 py-1 text-[11px] tabular-nums text-neutral-600 backdrop-blur">
        {obstacles.length.toLocaleString("de-DE")} Hindernisse
      </span>
    </div>
  )
}
