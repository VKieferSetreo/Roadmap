// Grund-Abfrage beim Ausblenden eines Funds. Der Grund fließt in die /debug-Triage
// (welche Quelle produziert die meisten Falsch-Funde) — daher Pflichtauswahl.

import { useState } from "react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { HIDE_REASON_LABEL, type Finding, type HideReason } from "@/types/domain"

const REASONS = Object.entries(HIDE_REASON_LABEL) as [HideReason, string][]

export function HideReasonDialog({
  finding,
  onClose,
  onConfirm,
}: {
  finding: Finding
  onClose: () => void
  onConfirm: (grund: HideReason, grundText?: string) => void
}) {
  const [grund, setGrund] = useState<HideReason>("falsche_fahrbahn")
  const [text, setText] = useState("")

  const confirm = () => {
    if (grund === "sonstiges" && text.trim().length < 3) return
    onConfirm(grund, text.trim() || undefined)
    onClose()
  }

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title="Fund ausblenden" subtitle={finding.titel} onClose={onClose} />
      <div className="px-6 py-5">
        <p className="mb-3 text-sm text-neutral-600">
          Warum soll dieser Fund ausgeblendet werden? Die Angabe hilft uns, die Datenqualität zu verbessern.
        </p>
        <fieldset className="flex flex-col gap-1.5">
          {REASONS.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50/50"
            >
              <input
                type="radio"
                name="hide-grund"
                value={key}
                checked={grund === key}
                onChange={() => setGrund(key)}
                className="accent-primary-600"
              />
              {label}
            </label>
          ))}
        </fieldset>
        {grund === "sonstiges" ? (
          <div className="mt-3">
            <label htmlFor="hide-grund-text" className="mb-1 block text-xs font-medium text-neutral-600">
              Kurz beschreiben <span className="text-severity-kritisch">*</span>
            </label>
            <textarea
              id="hide-grund-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="z. B. Baustelle existiert nicht mehr"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="destructive" onClick={confirm} disabled={grund === "sonstiges" && text.trim().length < 3}>
          Ausblenden
        </Button>
      </div>
    </Dialog>
  )
}
