// Genehmigungs-Archiv als schaltbarer Karten-Layer (NUR INTERN, Max 2026-07-15):
// alle bereits genehmigten Schwertransport-Strecken aus der Archive-App als duenne
// blaue Linien. Lazy: geladen wird erst beim ersten Einschalten (Payload ~4 MB gzip).

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { useMap } from "react-leaflet"
import { Archive, Loader2 } from "lucide-react"
import { api } from "@/api/roadmap"
import { useContextStore } from "@/store/context"
import { useStopMapEvents } from "./useStopMapEvents"
import { cn } from "@/lib/cn"

interface ArchivGeo {
  strecken: { id: string; abschnitte: { pts: [number, number][] }[] }[]
}

const STIL = { color: "#2563EB", weight: 1.5, opacity: 0.45, interactive: false } as const

function ArchivLayer({ an }: { an: boolean }) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const geladenRef = useRef(false)

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup()
    const group = groupRef.current
    if (!an) {
      map.removeLayer(group)
      return
    }
    group.addTo(map)
    if (!geladenRef.current) {
      geladenRef.current = true
      void api.archivStreckenGeo().then((data: ArchivGeo) => {
        for (const s of data.strecken ?? []) {
          for (const a of s.abschnitte ?? []) {
            if (a.pts?.length >= 2) L.polyline(a.pts, STIL).addTo(group)
          }
        }
      }).catch(() => {
        geladenRef.current = false // Fehler → naechster Toggle versucht es erneut
      })
    }
    return () => {
      map.removeLayer(group)
    }
  }, [map, an])

  return null
}

/** Toggle-Pill in der Karte + Layer. Rendert fuer externe Mandanten NICHTS. */
export function ArchivStreckenToggle() {
  const extern = useContextStore((s) => s.extern)
  const [an, setAn] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const rootRef = useStopMapEvents<HTMLDivElement>()
  if (extern) return null

  return (
    <>
      <ArchivLayer an={an} />
      <div ref={rootRef} className="absolute right-3 top-24 z-[1200]">
        <button
          onClick={() => {
            setAn((v) => !v)
            if (!an) {
              setLaedt(true)
              setTimeout(() => setLaedt(false), 2500)
            }
          }}
          title="Genehmigte Strecken aus dem Archiv ein-/ausblenden (nur intern)"
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold shadow-card backdrop-blur transition-colors",
            an ? "border-blue-300 bg-blue-50 text-blue-700" : "border-neutral-200 bg-white/90 text-neutral-600 hover:border-neutral-300",
          )}
        >
          {laedt && an ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          Archiv-Strecken
        </button>
      </div>
    </>
  )
}
