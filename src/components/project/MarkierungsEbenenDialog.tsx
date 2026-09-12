// Auswahlmaske, wenn eine Datei MEHRERE Punkt-Ebenen enthält (T-739) — mehrere KML-Ordner,
// mehrere Shapefiles in einem ZIP, mehrere Punkttabellen in einem GeoPackage. Bei genau einer
// Ebene erscheint sie gar nicht, dann wird direkt übernommen.

import { useState } from "react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import type { ParsedPunktEbene } from "@/lib/parsePunkte"

interface Props {
  fileName: string
  ebenen: ParsedPunktEbene[]
  onClose: () => void
  onConfirm: (gewaehlt: ParsedPunktEbene[]) => void
}

export function MarkierungsEbenenDialog({ fileName, ebenen, onClose, onConfirm }: Props) {
  // Vorauswahl: alles. Wer nur eine Ebene will, klickt schneller eine weg als neun an.
  const [gewaehlt, setGewaehlt] = useState<Set<number>>(() => new Set(ebenen.map((_, i) => i)))

  const toggle = (i: number) =>
    setGewaehlt((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  const punkte = ebenen.reduce((n, e, i) => (gewaehlt.has(i) ? n + e.punkte.length : n), 0)

  return (
    <Dialog open onClose={onClose} size="default">
      <DialogHeader
        title="Ebenen auswählen"
        subtitle={`${fileName} · ${ebenen.length} Ebenen gefunden`}
        onClose={onClose}
      />
      <div className="flex items-center justify-end gap-2 border-b border-neutral-100 px-4 py-2">
        <button
          type="button"
          onClick={() => setGewaehlt(new Set(ebenen.map((_, i) => i)))}
          className="text-xs font-medium text-primary-600 hover:underline"
        >
          Alle
        </button>
        <span className="text-xs text-neutral-300">·</span>
        <button
          type="button"
          onClick={() => setGewaehlt(new Set())}
          className="text-xs font-medium text-primary-600 hover:underline"
        >
          Keine
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-4">
        {ebenen.map((e, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={gewaehlt.has(i)}
                onChange={() => toggle(i)}
                className="h-4 w-4 shrink-0 rounded border-neutral-300 text-primary-600"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800">{e.name}</p>
                <p className="truncate text-xs tabular-nums text-neutral-400">
                  {e.punkte.length.toLocaleString("de-DE")}{" "}
                  {e.punkte.length === 1 ? "Markierung" : "Markierungen"}
                  {e.hinweis ? ` · ${e.hinweis}` : ""}
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3">
        <span className="text-xs tabular-nums text-neutral-500">
          {gewaehlt.size} von {ebenen.length} · {punkte.toLocaleString("de-DE")} Markierungen
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={gewaehlt.size === 0}
            onClick={() => onConfirm(ebenen.filter((_, i) => gewaehlt.has(i)))}
          >
            Übernehmen
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
