// Dialog zum Anlegen eines neuen Projekts (nur Name — Strecke folgt im Anlage-Tab).

import { useEffect, useState } from "react"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function NewProjectDialog({ open, onClose, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 80

  useEffect(() => {
    if (open) setName("")
  }, [open])

  const submit = () => {
    if (!valid) return
    onCreate(trimmed)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader title="Neues Projekt" subtitle="Strecke und Transport legst du danach an." onClose={onClose} />
      <div className="px-6 py-5">
        <Label htmlFor="project-name">Projektname</Label>
        <Input
          id="project-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="z.B. Trafo-Transport Hamburg → München"
          maxLength={80}
        />
        <p className="mt-1.5 text-xs text-neutral-400">2–80 Zeichen.</p>
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
