// Dialog zum Anlegen eines neuen Projekts. Strukturierter Name aus zwei Pflichtfeldern:
// Projektnummer (frei) + Name → "<Projektnummer>_<Name_mit_Unterstrichen>".
// KEIN vorgegebenes Präfix (W/P o.ä.) — die Projektnummer ist ein freies Textfeld, der Nutzer
// tippt sie genau so, wie sie ist. Beispiel: "W-5567" + "Hans Mustermann" → "W-5567_Hans_Mustermann".

import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog"
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

  // Projektnummer: frei (kein Präfix vorgegeben) — nur Leerzeichen-Folgen zusammenziehen, damit der
  // zusammengesetzte Name dateifreundlich bleibt. Name: Leerzeichen-Folgen → ein Unterstrich.
  const nummerClean = nummer.trim().replace(/\s+/g, "_")
  const nameClean = name.trim().replace(/\s+/g, "_")
  const finalName = `${nummerClean}_${nameClean}`
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
        subtitle="Strecke und Transport legen Sie danach an."
        onClose={onClose}
      />
      <DialogBody className="flex flex-col gap-4">
        <div>
          <Label htmlFor="project-nummer">Projektnummer</Label>
          <Input
            id="project-nummer"
            autoFocus
            autoComplete="off"
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. W-5567 oder P-12332"
            maxLength={40}
          />
        </div>
        <div>
          <Label htmlFor="project-name">Projektname</Label>
          <Input
            id="project-name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            placeholder="z. B. Trafo-Transport Werk Nord"
            maxLength={70}
          />
        </div>
        {/* Statische Vorschau (kein Eingabefeld) — aktualisiert sich live. */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400">
          Projektname: <span className="font-medium text-neutral-500">{nummerClean || "…"}_{nameClean || "…"}</span>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={submit} disabled={!valid}>
          Anlegen
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
