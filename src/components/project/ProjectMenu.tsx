// Drei-Punkte-Menü pro Projekt (Karte + Listen-Zeile): Umbenennen, Archivieren/
// Wiederherstellen, Löschen. Stoppt Klick-Propagation (liegt auf klickbaren Karten).

import { useState } from "react"
import { toast } from "sonner"
import { Archive, ArchiveRestore, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "@/components/ui/DropdownMenu"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { useProjectStore } from "@/store/projects"
import type { Project } from "@/types/domain"

export function ProjectMenu({ project }: { project: Project }) {
  const renameProject = useProjectStore((s) => s.renameProject)
  const archiveProject = useProjectStore((s) => s.archiveProject)
  const removeProject = useProjectStore((s) => s.removeProject)
  const [renameOpen, setRenameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(project.name)

  const archiviert = Boolean(project.archiviertAm)

  const commitRename = () => {
    const n = nameDraft.trim()
    if (n.length < 2 || n.length > 80) {
      toast.error("Projektname: 2–80 Zeichen.")
      return
    }
    if (n !== project.name) renameProject(project.id, n)
    setRenameOpen(false)
  }

  const onArchive = () => {
    archiveProject(project.id, !archiviert)
    toast.success(archiviert ? "Projekt wiederhergestellt." : "Projekt archiviert.")
  }

  const onDelete = () => {
    if (
      !window.confirm(
        `Projekt „${project.name}" endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
      )
    )
      return
    removeProject(project.id)
    toast.success("Projekt gelöscht.")
  }

  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu
        triggerLabel={`Aktionen für ${project.name}`}
        trigger={
          <span
            title="Aktionen"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <MoreVertical className="h-4 w-4" />
          </span>
        }
      >
        <DropdownItem
          onClick={() => {
            setNameDraft(project.name)
            setRenameOpen(true)
          }}
        >
          <Pencil className="h-4 w-4 text-neutral-400" /> Bearbeiten
        </DropdownItem>
        <DropdownItem onClick={onArchive}>
          {archiviert ? (
            <>
              <ArchiveRestore className="h-4 w-4 text-neutral-400" /> Wiederherstellen
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 text-neutral-400" /> Archivieren
            </>
          )}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem destructive onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Löschen
        </DropdownItem>
      </DropdownMenu>

      {renameOpen ? (
        <Dialog open onClose={() => setRenameOpen(false)} size="sm">
          <DialogHeader title="Projekt umbenennen" onClose={() => setRenameOpen(false)} />
          <div className="px-6 py-5">
            <Label htmlFor={`rename-${project.id}`}>Projektname</Label>
            <Input
              id={`rename-${project.id}`}
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
              }}
              maxLength={80}
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={commitRename}>Speichern</Button>
          </div>
        </Dialog>
      ) : null}
    </span>
  )
}
