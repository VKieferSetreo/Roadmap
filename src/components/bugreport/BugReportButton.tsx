// Header-Button (oben rechts): "Problem melden". Öffnet die Bug-Report-Maske.
// Nur im Live-Modus sinnvoll (Demo hat kein Backend, das Reports annimmt).

import { useState } from "react"
import { Bug } from "lucide-react"
import { BugReportDialog } from "./BugReportDialog"

export function BugReportButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Problem melden"
        aria-label="Problem melden"
        className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
      >
        <Bug className="h-4 w-4 text-neutral-400" />
        <span className="hidden sm:inline">Problem melden</span>
      </button>
      <BugReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
