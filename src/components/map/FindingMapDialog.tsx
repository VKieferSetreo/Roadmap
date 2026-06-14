// Karten-Popup für einen einzelnen Fund (aus der Datenbank-Tabelle): On-Screen-Dialog
// mit Leaflet-Karte, der konkrete Fund ist markiert und zentriert.

import { MapContainer, Marker, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Badge } from "@/components/ui/Badge"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { formatGueltigkeit, katMeta, SEVERITY_META } from "@/components/project/findingMeta"
import { findingPinIcon } from "./pins"
import { MapResize } from "./MapResize"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"
import type { DbFinding } from "@/api/roadmap"
import { cn } from "@/lib/cn"

interface FindingMapDialogProps {
  finding: DbFinding | null
  onClose: () => void
}

export function FindingMapDialog({ finding, onClose }: FindingMapDialogProps) {
  const tiles = TILE_LAYERS[useSettingsStore((s) => s.tileStyle)]
  if (!finding) return null
  const sev = SEVERITY_META[finding.severity]

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            <span className={cn("rounded-md p-1.5", sev.chip)}>
              <KategorieGlyph kategorie={finding.kategorie} className="h-3.5 w-3.5" />
            </span>
            {finding.titel}
            <Badge variant={sev.badge} size="sm">
              {sev.label}
            </Badge>
          </span>
        }
        subtitle={
          <>
            {finding.projektName} · {katMeta(finding.kategorie).label} · km{" "}
            {finding.km.toLocaleString("de-DE")}
            {finding.strassenRef ? ` · ${finding.strassenRef}` : ""}
            {finding.fachId ? ` · ID ${finding.fachId}` : ""}
          </>
        }
        onClose={onClose}
      />
      <div className="h-[55vh] min-h-[320px]">
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-neutral-200 px-6 py-3 text-xs text-neutral-600">
        {finding.beschreibung ? <span>{finding.beschreibung}</span> : null}
        <span className="tabular-nums">
          <span className="text-neutral-400">Gültig:</span>{" "}
          {formatGueltigkeit(finding.gueltigVon, finding.gueltigBis)}
        </span>
        {Object.entries(finding.detail).map(([k, v]) => (
          <span key={k} className="tabular-nums">
            <span className="text-neutral-400">{k}:</span> {v}
          </span>
        ))}
        {finding.zustaendig ? (
          <span>
            <span className="text-neutral-400">Zuständig:</span> {finding.zustaendig}
          </span>
        ) : null}
        {finding.quelle?.name ? (
          <span>
            <span className="text-neutral-400">Quelle:</span>{" "}
            {finding.quelle.url ? (
              <a
                href={finding.quelle.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 underline"
              >
                {finding.quelle.name}
              </a>
            ) : (
              finding.quelle.name
            )}
          </span>
        ) : null}
      </div>
    </Dialog>
  )
}
