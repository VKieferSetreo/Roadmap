// Karten-Popup für einen einzelnen Fund (aus der Datenbank-Tabelle): On-Screen-Dialog
// mit Leaflet-Karte. Gleiches Layout wie das Auswertungs-Popup (gemeinsame FindingCard),
// die Karte sitzt als Medium zwischen Kopf und Detailtext.

import { MapContainer, Marker, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Building2, X } from "lucide-react"
import { Dialog } from "@/components/ui/Dialog"
import { katMeta, SEVERITY_META } from "@/components/project/findingMeta"
import { FindingCard } from "./FindingCard"
import { findingPinIcon } from "./pins"
import { MapResize } from "./MapResize"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import type { DbFinding } from "@/api/roadmap"

interface FindingMapDialogProps {
  finding: DbFinding | null
  onClose: () => void
}

export function FindingMapDialog({ finding, onClose }: FindingMapDialogProps) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]
  if (!finding) return null
  const sev = SEVERITY_META[finding.severity]

  const subtitle =
    `${finding.projektName} · ${katMeta(finding.kategorie).label} · km ${finding.km.toLocaleString("de-DE")}` +
    `${finding.strassenRef ? ` · ${finding.strassenRef}` : ""}${finding.fachId ? ` · ID ${finding.fachId}` : ""}`

  return (
    <Dialog open onClose={onClose} size="lg">
      <div className="flex justify-end px-3 pt-3">
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-6 pb-6 pt-1">
        <FindingCard
          kategorie={finding.kategorie}
          titel={finding.titel}
          severity={finding.severity}
          subtitle={subtitle}
          beschreibung={finding.beschreibung}
          gueltigVon={finding.gueltigVon}
          gueltigBis={finding.gueltigBis}
          detail={finding.detail}
          quelle={finding.quelle}
          extra={
            finding.zustaendig ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-500">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                {finding.zustaendig}
              </p>
            ) : undefined
          }
          media={
            <div className="h-[42vh] min-h-[260px] overflow-hidden rounded-lg border border-neutral-200">
              {/* key erzwingt frisches Leaflet pro Fund (sauberes Zentrieren) */}
              <MapContainer
                key={finding.id}
                center={[finding.lat, finding.lng]}
                zoom={13}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer attribution={tiles.attribution} url={tiles.url} />
                <MapResize />
                <Marker
                  position={[finding.lat, finding.lng]}
                  icon={findingPinIcon(finding.kategorie, sev.marker, true)}
                />
              </MapContainer>
            </div>
          }
        />
      </div>
    </Dialog>
  )
}
