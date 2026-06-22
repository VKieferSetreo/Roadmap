// Kippbare 3D-Gelände-Ansicht (MapLibre GL): Esri-Satellit + Gelände-DEM (Relief) +
// Esri-Referenz-Overlays (Straßen/Orte). Strecke(n) als Linie, Funde als farbige Punkte.
// Wird NUR im "3d"-Kartenmodus der Projekt-Karte gerendert und lazy geladen (großes Bundle).
// Reiche Fund-Popups/Chat bleiben der 2D-Ansicht vorbehalten (hier: Klick = Fund wählen).
//
// CSP: MapLibre lädt ALLE Kacheln per fetch (nicht <img>) → connect-src muss arcgisonline +
// amazonaws erlauben (im setreo-proxy-Caddyfile gesetzt), sonst lädt nichts.

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Finding } from "@/types/domain"
import { EIGEN_COLOR, istEigenerEintrag, SEVERITY_META } from "@/components/project/findingMeta"
import { geomMidpoint } from "@/lib/geom"

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

export interface Route3DRoute {
  id: string
  positions: [number, number][] // [lat, lng]
  farbe: string
}

const lngLat = ([lat, lng]: [number, number]): [number, number] => [lng, lat]

function routesFC(routes: Route3DRoute[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes
      .filter((r) => r.positions.length >= 2)
      .map((r) => ({
        type: "Feature",
        properties: { color: r.farbe },
        geometry: { type: "LineString", coordinates: r.positions.map(lngLat) },
      })),
  }
}

function findingsFC(findings: Finding[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: findings.flatMap((f) => {
      const pos = geomMidpoint(f.geom) ?? ([f.lat, f.lng] as [number, number])
      if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return []
      const color = istEigenerEintrag(f.quelle) ? EIGEN_COLOR : SEVERITY_META[f.severity].marker
      return [
        {
          type: "Feature" as const,
          properties: { id: f.id, color },
          geometry: { type: "Point" as const, coordinates: lngLat(pos) },
        },
      ]
    }),
  }
}

/** Passt die Kamera (mit Pitch) an die Strecke an. Gibt true zurück, wenn gefittet wurde. */
function fitToRoutes(map: maplibregl.Map, routes: Route3DRoute[]): boolean {
  const pts = routes.flatMap((r) => r.positions)
  if (pts.length < 2) return false
  const b = new maplibregl.LngLatBounds()
  for (const p of pts) b.extend(lngLat(p))
  map.fitBounds(b, { padding: 64, pitch: 60, bearing: -17, duration: 0, maxZoom: 14 })
  return true
}

export default function Route3D({
  routes,
  findings,
  onSelect,
}: {
  routes: Route3DRoute[]
  findings: Finding[]
  onSelect?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const fittedRef = useRef(false)
  const [loaded, setLoaded] = useState(false)

  // Karte einmal aufbauen (leere Quellen + Layer); Daten setzt der zweite Effect.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster",
            tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
            tileSize: 256,
            maxzoom: 19,
            attribution: "&copy; Esri, Maxar, Earthstar Geographics",
          },
          transport: {
            type: "raster",
            tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`],
            tileSize: 256,
            maxzoom: 19,
          },
          places: {
            type: "raster",
            tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
            tileSize: 256,
            maxzoom: 19,
          },
          terrain: {
            type: "raster-dem",
            tiles: ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 14,
          },
        },
        layers: [
          { id: "sat", type: "raster", source: "sat" },
          { id: "transport", type: "raster", source: "transport" },
          { id: "places", type: "raster", source: "places" },
        ],
        terrain: { source: "terrain", exaggeration: 1.3 },
      },
      center: [10.4, 51.2],
      zoom: 5,
      pitch: 60,
      bearing: -17,
      maxPitch: 80,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")

    map.on("load", () => {
      map.addSource("routes", { type: "geojson", data: EMPTY })
      map.addLayer({
        id: "routes-casing",
        type: "line",
        source: "routes",
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.6 },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: { "line-color": ["get", "color"], "line-width": 4 },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addSource("findings", { type: "geojson", data: EMPTY })
      map.addLayer({
        id: "findings-pt",
        type: "circle",
        source: "findings",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      })
      map.on("click", "findings-pt", (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id != null) onSelectRef.current?.(String(id))
      })
      map.on("mouseenter", "findings-pt", () => (map.getCanvas().style.cursor = "pointer"))
      map.on("mouseleave", "findings-pt", () => (map.getCanvas().style.cursor = ""))
      setLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Daten setzen + einmalig auf die Strecke fitten.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    ;(map.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData(routesFC(routes))
    ;(map.getSource("findings") as maplibregl.GeoJSONSource | undefined)?.setData(findingsFC(findings))
    if (!fittedRef.current) fittedRef.current = fitToRoutes(map, routes)
  }, [loaded, routes, findings])

  return <div ref={containerRef} className="h-full w-full" />
}
