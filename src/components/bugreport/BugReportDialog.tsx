// Bug-Report-Maske: freie Beschreibung + automatisch erfasster Kontext-Snapshot
// (aktuelle View, Daten-/Seitenstatus, Browser). Wird vom Header-Button geöffnet.

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Send } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Textarea } from "@/components/ui/Input"
import { collectBugContext } from "@/lib/bugContext"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"

export function BugReportDialog({
  open,
  onClose,
  screenshot,
}: {
  open: boolean
  onClose: () => void
  screenshot?: string | null
}) {
  const [beschreibung, setBeschreibung] = useState("")
  const [busy, setBusy] = useState(false)
  const [showKontext, setShowKontext] = useState(false)

  // Kontext beim Öffnen einfrieren (Snapshot zum Meldezeitpunkt).
  const snapshot = useMemo(() => (open ? collectBugContext() : null), [open])

  const submit = async () => {
    const text = beschreibung.trim()
    if (!text) {
      toast.error("Bitte beschreibe kurz, was nicht passt.")
      return
    }
    setBusy(true)
    try {
      await api.bugReports.create({
        beschreibung: text,
        viewPath: snapshot?.viewPath,
        kontext: snapshot?.kontext,
        screenshot: screenshot ?? null,
      })
      toast.success("Danke! Ihr Bug-Report ist bei uns angekommen.")
      setBeschreibung("")
      setShowKontext(false)
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Senden fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="default">
      <DialogHeader
        title="Problem melden"
        subtitle="Beschreibe, was gerade nicht passt — wir hängen den technischen Kontext automatisch an."
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
        <div>
          <Textarea
            autoFocus
            rows={5}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="z.B. Die Karte lädt nicht, der Filter springt zurück, eine Zahl stimmt nicht …"
            className="resize-y"
            maxLength={5000}
          />
          <p className="mt-1 text-right text-[11px] text-neutral-400">{beschreibung.length}/5000</p>
        </div>

        {/* Automatisch erfasster Seiten-Screenshot (wird mitgesendet) */}
        {screenshot ? (
          <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-2">
            <p className="mb-1.5 text-xs font-medium text-neutral-600">Screenshot der Seite — wird mitgesendet</p>
            <img
              src={screenshot}
              alt="Seiten-Screenshot"
              className="max-h-40 w-full rounded border border-neutral-200 object-contain"
            />
          </div>
        ) : null}

        {/* Automatisch erfasster Kontext — einklappbar */}
        <div className="rounded-md border border-neutral-200 bg-neutral-50/60">
          <button
            type="button"
            onClick={() => setShowKontext((s) => !s)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:text-neutral-900"
          >
            {showKontext ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Automatisch mitgesendeter Kontext
          </button>
          {showKontext ? (
            <pre className="max-h-56 overflow-auto border-t border-neutral-200 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
              {JSON.stringify(snapshot?.kontext ?? {}, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button onClick={() => void submit()} disabled={busy}>
          <Send className="h-4 w-4" /> {busy ? "Senden…" : "Absenden"}
        </Button>
      </div>
    </Dialog>
  )
}
