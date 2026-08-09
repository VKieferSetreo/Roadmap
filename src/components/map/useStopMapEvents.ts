// Eigene Datei, weil react-refresh/only-export-components sonst greift: eine Datei,
// die Komponenten UND einen Hook exportiert, bricht Fast Refresh. Lag bis 09.08.2026
// in MapControls.tsx und hielt die CI sechs Wochen rot (--max-warnings 0).

import { useEffect, useRef } from "react"
import L from "leaflet"

/** Map-Events am Control-Root abklemmen (Leaflet greift sonst Klicks/Scroll ab). */
export function useStopMapEvents<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  return ref
}
