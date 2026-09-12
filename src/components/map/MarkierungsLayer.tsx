// Karten-Ebene für Markierungen (T-739) — eigene Punkte eines Projekts (Parkplätze, Standorte …).
//
// OHNE Clustering (Max 2026-09-12: „nur die Punkte DIREKT anzeigen"). Jeder Punkt ist ein eigener
// Marker, es gibt keine Zusammenfassung bei kleinem Zoom. Das ist eine bewusste Anzeige-
// entscheidung, keine Nachlässigkeit: der Disponent will seine Standorte sehen, nicht eine Zahl
// in einem Kreis. Die Kehrseite steht in den Grenzen (MARKIERUNG_GRENZEN) — sehr große Ebenen
// legen entsprechend viele Marker ins DOM.
//
// Imperativ über eine LayerGroup statt als React-<Marker>-Kinder, aus demselben Grund wie in
// ObstaclesMap.tsx (Max 2026-06-14): bei der Children-Variante ruckelte die Karte.
//
// Fund-Marker sind Tropfen mit StVO-Schild (pins.tsx). Markierungen sind bewusst RUNDE Punkte in
// der Ebenenfarbe: sie sind keine Funde, und der Formunterschied trennt sie auf einen Blick.

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
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

// Farben und Abstaende kommen aus .mpopup* in styles/globals.css, NICHT als Hex hierher:
// das Projekt fuehrt `neutral` als Zinc, handgewaehlte Slate-Toene faerben das Popup blaustichig
// gegen den Rest der Oberflaeche.
function popupHtml(titel: string, ebenenName: string, attribute: Record<string, string>): string {
  const zeilen = Object.entries(attribute)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("")
  return `<div class="mpopup" style="min-width:180px;max-width:280px">
    <p class="mpopup-titel">${esc(titel)}</p>
    <p class="mpopup-ebene">${esc(ebenenName)}</p>
    ${zeilen ? `<table class="mpopup-tabelle">${zeilen}</table>` : `<p class="mpopup-leer">Keine weiteren Angaben in der Datei.</p>`}
  </div>`
}

/** EINE Gruppe je Ebene, damit ein Umschalten nur die betroffene Ebene anfasst und die übrigen
 *  unberührt stehen bleiben. */
function EbenenCluster({ ebene }: { ebene: MarkierungsEbene }) {
  const map = useMap()

  useEffect(() => {
    const gruppe = L.layerGroup()
    const icon = punktIcon(ebene.farbe)
    const marker: L.Layer[] = []
    ebene.punkte.forEach((p, i) => {
      // T-600: NaN/Infinity bricht Leaflets Zoom-Animation und lässt dann ALLE Marker im Pane
      // verschwinden, nicht nur den kaputten. Hier raus, nicht erst beim Zeichnen.
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
      const titel = p.name?.trim() || `Punkt ${i + 1}`
      marker.push(
        L.marker([p.lat, p.lng], { icon, title: titel }).bindPopup(
          popupHtml(titel, ebene.name, p.attribute ?? {}),
        ),
      )
    })
    if (!marker.length) return

    for (const m of marker) gruppe.addLayer(m)
    map.addLayer(gruppe)
    return () => {
      map.removeLayer(gruppe)
    }
    // Nur an dem hängen, was die Darstellung bestimmt. Am Objekt selbst zu hängen würde die Ebene
    // bei jedem Store-Update neu aufbauen, auch wenn sich an ihren Punkten nichts geändert hat.
  }, [map, ebene.punkte, ebene.farbe, ebene.name])

  return null
}

export function MarkierungsLayer({ ebenen }: { ebenen: MarkierungsEbene[] }) {
  return (
    <>
      {ebenen.map((e) => (
        <EbenenCluster key={e.id} ebene={e} />
      ))}
    </>
  )
}
