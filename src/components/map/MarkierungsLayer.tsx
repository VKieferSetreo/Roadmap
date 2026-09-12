// Karten-Ebene für Markierungen (T-739) — eigene Punkte eines Projekts (Parkplätze, Standorte …).
//
// Imperativ über leaflet.markercluster, NICHT als React-<Marker>-Kinder: dieselbe Begründung wie
// in ObstaclesMap.tsx (Max 2026-06-14) — bei der Children-Variante hängen alle Marker dauerhaft im
// DOM und die Karte ruckelt. Ein Projekt darf bis zu 10.000 Markierungen tragen, das ist genau der
// Fall, für den der Cluster gebaut ist.
//
// Fund-Marker sind Tropfen mit StVO-Schild (pins.tsx). Markierungen sind bewusst RUNDE Punkte in
// der Ebenenfarbe: sie sind keine Funde, und der Formunterschied trennt sie auf einen Blick.

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet.markercluster"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import type { MarkierungsEbene } from "@/types/domain"

/** Attributwerte stammen aus einer hochgeladenen Fremddatei und gehen in innerHTML → escapen. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Runder Punkt in Ebenenfarbe, weißer Rand, gezeichneter Schatten (kein CSS-Filter → flickerfrei). */
function punktIcon(farbe: string): L.DivIcon {
  const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9.6" r="6.4" fill="rgba(15,23,42,0.18)"/>
    <circle cx="9" cy="9" r="6.4" fill="${esc(farbe)}" stroke="#ffffff" stroke-width="2"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -8],
  })
}

function popupHtml(titel: string, ebenenName: string, attribute: Record<string, string>): string {
  const zeilen = Object.entries(attribute)
    .filter(([, v]) => v !== "")
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;font-weight:500;color:#64748b;padding:2px 10px 2px 0;vertical-align:top;white-space:nowrap">${esc(k)}</th><td style="color:#1f2937;padding:2px 0;vertical-align:top">${esc(v)}</td></tr>`,
    )
    .join("")
  return `<div style="min-width:180px;max-width:280px">
    <p style="margin:0;font-weight:600;color:#0f172a">${esc(titel)}</p>
    <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">${esc(ebenenName)}</p>
    ${zeilen ? `<table style="margin-top:8px;font-size:12px;border-collapse:collapse">${zeilen}</table>` : `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Keine weiteren Angaben in der Datei.</p>`}
  </div>`
}

/** Cluster-Gruppe je Ebene, damit ein- und ausblenden eine Ebene wirklich komplett entfernt. */
export function MarkierungsLayer({ ebenen }: { ebenen: MarkierungsEbene[] }) {
  const map = useMap()

  useEffect(() => {
    if (!ebenen.length) return
    // leaflet.markercluster erweitert L zur Laufzeit (kein @types-Paket) → lose getypt.
    const cluster = (
      L as unknown as {
        markerClusterGroup: (o: unknown) => L.LayerGroup & { addLayers: (l: L.Layer[]) => void }
      }
    ).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      animate: false, // wie ObstaclesMap: kein Opacity-Transition-Pfad → Marker bleiben sichtbar
    })

    const marker: L.Layer[] = []
    for (const e of ebenen) {
      const icon = punktIcon(e.farbe)
      e.punkte.forEach((p, i) => {
        // T-600: NaN/Infinity würde die Bounds-Mathematik von markercluster vergiften und beim
        // Zoom ALLE Marker verschwinden lassen. Hier raus, nicht erst beim Zeichnen.
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
        const titel = p.name?.trim() || `Punkt ${i + 1}`
        marker.push(
          L.marker([p.lat, p.lng], { icon, title: titel }).bindPopup(
            popupHtml(titel, e.name, p.attribute ?? {}),
          ),
        )
      })
    }
    if (!marker.length) return

    cluster.addLayers(marker)
    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
    }
  }, [map, ebenen])

  return null
}
