// Header-Button (oben rechts): "Problem melden". Erfasst zuerst einen Screenshot der
// aktuellen Seite (noch OHNE die Melde-Maske — die ist noch nicht offen), öffnet dann die
// Maske mit dem Bild im Gepäck. Nur im Live-Modus sinnvoll (Demo hat kein Backend).

import { useState } from "react"
import { Bug } from "lucide-react"
import { BugReportDialog } from "./BugReportDialog"
import { captureScreenshot } from "@/lib/screenshot"

export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [shot, setShot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  const onClick = async () => {
    setCapturing(true)
    // Vor dem Öffnen der Maske: Screenshot der sauberen Seite (best-effort, wirft nie).
    const s = await captureScreenshot()
    setShot(s)
    setCapturing(false)
    setOpen(true)
  }

  return (
    // data-no-screenshot: hält den Melde-Button selbst aus der Erfassung raus.
    <span data-no-screenshot="true">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={capturing}
        title="Problem melden"
        aria-label="Problem melden"
        className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-60"
      >
        <Bug className="h-4 w-4 text-neutral-400" />
        <span className="hidden sm:inline">{capturing ? "Moment …" : "Problem melden"}</span>
      </button>
      <BugReportDialog
        open={open}
        screenshot={shot}
        onClose={() => {
          setOpen(false)
          setShot(null)
        }}
      />
    </span>
  )
}
