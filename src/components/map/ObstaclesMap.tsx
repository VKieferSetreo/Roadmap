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
import { geomMidpoint, geomToLines } from "@/lib/geom"
import type { Obstacle } from "@/types/domain"

const GERMANY: [number, number] = [51.1657, 10.4515]
const PIN_GLOBAL = "#475569" // Slate — globaler Setreo-/Connector-Bestand
// Ab dieser Zoomstufe: Strecken-Linien zeigen UND Cluster auflösen (jede Strecke
// bekommt ihren eigenen Pin). Darunter: nur geclusterte Pins, keine Linien (Übersicht).
const LINES_MIN_ZOOM = 11

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
    ${eigen ? `<div class="mt-2 border-t border-neutral-100 pt-2"><button data-delete-obstacle type="button" class="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Eintrag verwerfen</button></div>` : ""}
  </div>`
}

type DeleteFn = (id: string) => void

/** „Eintrag verwerfen"-Button im Popup (nur eigene Einträge) mit dem Delete-Handler verdrahten. */
function wireDelete(layer: L.Layer, o: Obstacle, onDelete?: DeleteFn) {
  if (!onDelete || !istEigenerEintrag(o.quelle)) return
  layer.on("popupopen", (e: L.LeafletEvent & { popup: L.Popup }) => {
    const btn = e.popup.getElement()?.querySelector("[data-delete-obstacle]")
    if (!btn) return
    const handler = () => {
      if (window.confirm("Diesen eigenen Eintrag wirklich verwerfen?")) {
        layer.closePopup()
        onDelete(o.id)
      }
    }
    btn.addEventListener("click", handler, { once: true })
  })
}

/** Baut das markercluster-Layer imperativ; Rebuild NUR bei Daten-Änderung (nicht bei Zoom). */
function ObstacleClusterLayer({ obstacles, onDelete }: { obstacles: Obstacle[]; onDelete?: DeleteFn }) {
  const map = useMap()
  useEffect(() => {
    // leaflet.markercluster erweitert L zur Laufzeit (kein @types-Paket) → lose getypt.
    const cluster = (L as unknown as {
      markerClusterGroup: (o: unknown) => L.LayerGroup & { addLayers: (l: L.Layer[]) => void }
    }).markerClusterGroup({
      chunkedLoading: true, // greift bei addLayers (bulk): Marker häppchenweise → kein Freeze
      maxClusterRadius: 60,
      // animate:false ist BEWUSST (Max 2026-06-14, „Icons nach Zoom unsichtbar"):
      // markercluster blendet Marker beim Zoom über Opacity-Transitions ein/aus
      // (clusterHide → opacity 0, dann ein enqueued setTimeout clusterShow → opacity 1).
      // Geht dieser Callback verloren (Zoom-Interrupt), bleibt der Marker auf opacity 0
      // = „während Zoom sichtbar, danach weg". Ohne Animation werden Marker synchron bei
      // voller Deckkraft hinzugefügt → sie bleiben zuverlässig sichtbar.
      animate: false,
      // Ab der Zoomstufe, ab der auch die Strecken-Linien erscheinen, einzelne Pins zeigen —
      // sonst hätte eine sichtbare Strecke keinen eigenen Pin (steckte im Cluster) = „Tag fehlt".
      disableClusteringAtZoom: LINES_MIN_ZOOM,
    })
    const markers = obstacles.map((o) => {
      const eigen = istEigenerEintrag(o.quelle)
      // Pin MITTIG auf die Strecke (geom-Mittelpunkt) statt am Anfangspunkt → Tag sitzt auf der Linie.
      const pos = geomMidpoint(o.geom) ?? ([o.lat, o.lng] as [number, number])
      const marker = L.marker(pos, {
        icon: findingPinIcon(o.kategorie, eigen ? EIGEN_COLOR : PIN_GLOBAL, false),
      })
      marker.bindPopup(() => obstaclePopupHtml(o), { maxWidth: 320, minWidth: 240 })
      wireDelete(marker, o, onDelete)
      return marker
    })
    cluster.addLayers(markers) // bulk → chunkedLoading greift, deutlich schneller als addLayer-Loop
    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
    }
  }, [map, obstacles, onDelete])
  return null
}

/** Strecken-Geometrie (geom = Linie/MultiLineString) als Polylines — die betroffene
 *  Strecke statt nur ein Punkt. Eigene Ebene (NICHT geclustert), unter den Markern,
 *  nur ab LINES_MIN_ZOOM sichtbar; Rebuild nur bei Daten-Änderung. */
function ObstacleLinesLayer({ obstacles, onDelete }: { obstacles: Obstacle[]; onDelete?: DeleteFn }) {
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
      line.bindTooltip(o.name, { sticky: true, direction: "top" })
      line.bindPopup(() => obstaclePopupHtml(o), { maxWidth: 320, minWidth: 240 })
      wireDelete(line, o, onDelete)
      line.addTo(group)
    }
    // Nur ab LINES_MIN_ZOOM einblenden (sonst Punkt-Rauschen in der Übersicht).
    const sync = () => {
      const show = map.getZoom() >= LINES_MIN_ZOOM
      if (show && !map.hasLayer(group)) group.addTo(map)
      else if (!show && map.hasLayer(group)) map.removeLayer(group)
    }
    sync()
    map.on("zoomend", sync)
    return () => {
      map.off("zoomend", sync)
      if (map.hasLayer(group)) map.removeLayer(group)
    }
  }, [map, obstacles, onDelete])
  return null
}

export function ObstaclesMap({ obstacles, onDelete }: { obstacles: Obstacle[]; onDelete?: DeleteFn }) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <MapContainer center={GERMANY} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        {/* Linien zuerst (unter den Markern), dann das Cluster */}
        <ObstacleLinesLayer obstacles={obstacles} onDelete={onDelete} />
        <ObstacleClusterLayer obstacles={obstacles} onDelete={onDelete} />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-2 left-3 z-[500] rounded-md bg-white/85 px-2 py-1 text-[11px] tabular-nums text-neutral-600 backdrop-blur">
        {obstacles.length.toLocaleString("de-DE")} Hindernisse
      </span>
    </div>
  )
}
