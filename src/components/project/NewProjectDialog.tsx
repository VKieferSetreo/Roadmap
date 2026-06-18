// Dialog zum Anlegen eines neuen Projekts. Strukturierter Name aus zwei Pflichtfeldern:
// W-Nummer (Projektnummer) + Name → "W-<nummer>_<Name_mit_Unterstrichen>" (Max 2026-06-18).
// Beispiel: 12332 + "Hans Mustermann" → "W-12332_Hans_Mustermann".

import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function NewProjectDialog({ open, onClose, onCreate }: NewProjectDialogProps) {
  const [nummer, setNummer] = useState("")
  const [name, setName] = useState("")

  useEffect(() => {
    if (open) {
      setNummer("")
      setName("")
    }
  }, [open])

  // Nummer: Leerzeichen raus, ein versehentlich getipptes führendes "W-" entfernen
  // (sonst doppelter Präfix). Name: Leerzeichen-Folgen → ein Unterstrich.
  const nummerClean = nummer.trim().replace(/\s+/g, "").replace(/^w-/i, "")
  const nameClean = name.trim().replace(/\s+/g, "_")
  const finalName = `W-${nummerClean}_${nameClean}`
  const valid = useMemo(
    () => nummerClean.length >= 1 && nameClean.length >= 1 && finalName.length <= 80,
    [nummerClean, nameClean, finalName],
  )

  const submit = () => {
    if (!valid) return
    onCreate(finalName)
    onClose()
  }
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader
        title="Neues Projekt"
        subtitle="Strecke und Transport legst du danach an."
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <Label htmlFor="project-nummer">Projektnummer</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">
              W-
            </span>
            <Input
              id="project-nummer"
              autoFocus
              value={nummer}
              onChange={(e) => setNummer(e.target.value)}
              onKeyDown={onEnter}
              placeholder="12332"
              className="pl-8"
              maxLength={40}
              inputMode="numeric"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            placeholder="Hans Mustermann"
            maxLength={70}
          />
        </div>
        {/* Statische Vorschau (kein Eingabefeld) — aktualisiert sich live, schon ab der W-Nummer. */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400">
          Projektname: <span className="font-medium text-neutral-500">W-{nummerClean || "…"}_{nameClean || "…"}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={submit} disabled={!valid}>
          Anlegen
        </Button>
      </div>
    </Dialog>
  )
}
