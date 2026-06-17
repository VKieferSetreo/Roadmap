// Export-Dialog: öffnet beim Klick auf „PDF-Bericht" oder „Excel (CSV)" und lässt VOR dem
// Export Zeitraum (VON/BIS) + die relevanten Strecken wählen — z.B. für Teiltransporte, die
// nur einen Datumsabschnitt einer Teilstrecke betreffen. Bestätigen → Export läuft im Parent.

import { useMemo, useState } from "react"
import { FileDown, FileSpreadsheet } from "lucide-react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { imExportZeitraum, visibleFindings } from "./findingMeta"
import type { Project } from "@/types/domain"

export interface ExportConfig {
  von: string
  bis: string
  routeIds: string[]
}

export function ExportDialog({
  project,
  target,
  onClose,
  onConfirm,
}: {
  project: Project
  target: "pdf" | "csv"
  onClose: () => void
  onConfirm: (cfg: ExportConfig) => void
}) {
  const routen = useMemo(() => project.routes.filter((r) => r.points.length >= 2), [project.routes])
  const [von, setVon] = useState("")
  const [bis, setBis] = useState("")
  const [selected, setSelected] = useState<string[]>(() => routen.map((r) => r.id))

  const sichtbar = useMemo(() => visibleFindings(project.findings), [project.findings])
  // Live-Vorschau: wie viele Funde je Strecke fallen ins gewählte Zeitfenster?
  const countFor = (routeId: string) =>
    sichtbar.filter((f) => f.routeId === routeId && imExportZeitraum(f, von, bis)).length

  const alleAn = routen.length > 0 && selected.length === routen.length
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAlle = () => setSelected(alleAn ? [] : routen.map((r) => r.id))

  const gesamt = useMemo(
    () =>
      sichtbar.filter(
        (f) =>
          imExportZeitraum(f, von, bis) &&
          (f.routeId == null || selected.includes(f.routeId)),
      ).length,
    [sichtbar, von, bis, selected],
  )

  const Icon = target === "pdf" ? FileDown : FileSpreadsheet
  const titel = target === "pdf" ? "PDF-Bericht erstellen" : "Excel-Export (CSV)"

  return (
    <Dialog open onClose={onClose} size="default">
      <DialogHeader
        title={titel}
        subtitle="Zeitraum und Strecken wählen — exportiert werden nur Funde, die hineinfallen."
        onClose={onClose}
      />
      <div className="flex flex-col gap-5 px-6 py-5">
        {/* Zeitraum */}
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-800">Zeitraum (optional)</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="exp-von" className="text-xs font-medium text-neutral-500">
                Von
              </label>
              <Input
                id="exp-von"
                type="date"
                value={von}
                max={bis || undefined}
                onChange={(e) => setVon(e.target.value)}
                className="h-9 w-[160px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="exp-bis" className="text-xs font-medium text-neutral-500">
                Bis
              </label>
              <Input
                id="exp-bis"
                type="date"
                value={bis}
                min={von || undefined}
                onChange={(e) => setBis(e.target.value)}
                className="h-9 w-[160px]"
              />
            </div>
            {von || bis ? (
              <button
                type="button"
                onClick={() => {
                  setVon("")
                  setBis("")
                }}
                className="mb-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700"
              >
                zurücksetzen
              </button>
            ) : (
              <span className="mb-2 text-xs text-neutral-400">leer = ganzer Zeitraum</span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-neutral-400">
            Dauerhafte Hindernisse (Brücken, Höhen-/Gewichtslimits) sind immer dabei — gefiltert
            werden nur zeitlich begrenzte Funde (Baustellen, Sperrungen).
          </p>
        </div>

        {/* Strecken */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800">Strecken</p>
            {routen.length > 1 ? (
              <button
                type="button"
                onClick={toggleAlle}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {alleAn ? "Keine" : "Alle"}
              </button>
            ) : null}
          </div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {routen.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50/50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                  className="h-4 w-4 accent-primary-600"
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.farbe }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-neutral-800">{r.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {countFor(r.id)} Funde
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4">
        <span className="text-sm text-neutral-500">
          <span className="font-semibold tabular-nums text-neutral-800">{gesamt}</span> Funde im Export
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onConfirm({ von, bis, routeIds: selected })} disabled={selected.length === 0}>
            <Icon className="h-4 w-4" />
            {target === "pdf" ? "Bericht erstellen" : "CSV exportieren"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
