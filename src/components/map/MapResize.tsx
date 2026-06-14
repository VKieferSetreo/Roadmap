// Beobachtet die Größe des Leaflet-Containers und ruft bei JEDER Änderung invalidateSize().
// Nötig, weil Leaflet Container-Resizes nicht selbst bemerkt: Klappt z.B. die Sidebar ein/aus,
// wird die Karte breiter — ohne invalidateSize() rechnet Leaflet mit der alten Breite weiter
// und lädt rechts keine Tiles nach (Max 2026-06-14: „rechts systematisch zu wenig geladen").
//
// Der ResizeObserver feuert auch WÄHREND der 200ms-Breiten-Transition mehrfach; rAF-debounced
// bleibt das günstig und die Tiles laufen sauber mit auf. pan:false → kein Re-Zentrieren-Jitter
// während der Animation, nur der neu freigewordene Bereich wird gefüllt.

import { useEffect } from "react"
import { useMap } from "react-leaflet"

export function MapResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [map])
  return null
}
