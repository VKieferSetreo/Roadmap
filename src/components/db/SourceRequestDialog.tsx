// "Quelle anfragen": Nutzer schlägt eine neue Datenquelle vor (URL + Beschreibung).
// Landet als Vorschlag im /debug-Reiter zur Triage. Spiegelt die Bug-Report-Maske.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Send } from "lucide-react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input, Label, Textarea } from "@/components/ui/Input"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"

export function SourceRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("")
  const [beschreibung, setBeschreibung] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl("")
      setBeschreibung("")
    }
  }, [open])

  const urlOk = /^https?:\/\//i.test(url.trim())
  const valid = urlOk && beschreibung.trim().length > 0

  const submit = async () => {
    if (!valid) {
      toast.error("Bitte URL (mit https://) und Beschreibung angeben.")
      return
    }
    setBusy(true)
    try {
      await api.sourceRequests.create({ url: url.trim(), beschreibung: beschreibung.trim() })
      toast.success("Danke! Dein Quellen-Vorschlag ist bei uns angekommen.")
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
        title="Quelle anfragen"
        subtitle="Kennst du eine Datenquelle, die wir aufnehmen sollten? Schick uns URL + kurze Beschreibung."
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 px-6 py-4">
        <div>
          <Label htmlFor="src-url">URL der Quelle</Label>
          <Input
            id="src-url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            maxLength={2000}
          />
          {url && !urlOk ? (
            <p className="mt-1 text-xs text-severity-kritisch">Bitte eine vollständige URL (mit https://).</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="src-desc">Beschreibung</Label>
          <Textarea
            id="src-desc"
            rows={4}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Was liefert die Quelle? (z.B. Baustellen, Brücken-Sperrungen, Bundesland, Format …)"
            className="resize-y"
            maxLength={5000}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !valid}>
          <Send className="h-4 w-4" /> {busy ? "Senden…" : "Vorschlag senden"}
        </Button>
      </div>
    </Dialog>
  )
}
