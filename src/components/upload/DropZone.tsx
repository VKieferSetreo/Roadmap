// Barrierearme Drag-&-Drop-Upload-Fläche (native HTML5-DnD, kein externes Lib).
// Validiert MIME + Größe, meldet die gewählte Datei nach oben.

import { useId, useRef, useState, type DragEvent } from "react"
import { FileCheck2, UploadCloud, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatBytes } from "@/lib/format"

interface DropZoneProps {
  /** akzeptierte MIME-/Endungs-Liste, z.B. ".gpx,.kml,application/gpx+xml". */
  accept?: string
  label: string
  hint?: string
  /** aktuell gewählter Dateiname (controlled). */
  value?: string
  maxSizeMb?: number
  onFile: (file: File) => void
  onClear?: () => void
  ariaLabel?: string
  className?: string
  /** kompakte (halbe) Höhe für enge Layouts. */
  compact?: boolean
}

export function DropZone({
  accept,
  label,
  hint,
  value,
  maxSizeMb = 50,
  onFile,
  onClear,
  ariaLabel,
  className,
  compact = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errId = useId()

  const validateAndEmit = (file: File | undefined) => {
    if (!file) return
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Datei zu groß (max. ${maxSizeMb} MB).`)
      return
    }
    setError(null)
    onFile(file)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    validateAndEmit(e.dataTransfer.files?.[0])
  }

  const openPicker = () => inputRef.current?.click()

  if (value) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3",
          className,
        )}
      >
        <div className="rounded-md bg-primary-100 p-2 text-primary-700">
          <FileCheck2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-800">{value}</p>
          <p className="text-xs text-neutral-500">Streckendatei geladen</p>
        </div>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Datei entfernen"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-white hover:text-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? label}
        aria-describedby={error ? errId : undefined}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
          compact ? "min-h-[90px] px-4 py-3" : "min-h-[180px] px-6 py-8",
          dragging
            ? "border-primary-500 bg-primary-50"
            : error
              ? "border-red-300 bg-red-50/40"
              : "border-neutral-300 bg-neutral-50/50 hover:border-primary-400 hover:bg-primary-50/40",
        )}
      >
        <div
          className={cn(
            "rounded-full",
            compact ? "mb-1.5 p-2" : "mb-3 p-3",
            dragging ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-400",
          )}
        >
          <UploadCloud className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
        <p className="text-sm font-medium text-neutral-700">{label}</p>
        {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
        {!compact ? (
          <p className="mt-2 text-xs text-neutral-400">
            Datei hierher ziehen oder klicken · max. {formatBytes(maxSizeMb * 1024 * 1024)}
          </p>
        ) : null}
      </div>
      {error ? (
        <p id={errId} role="alert" className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => validateAndEmit(e.target.files?.[0] ?? undefined)}
      />
    </div>
  )
}
