// Veröffentlichen-Flow: Projekt nach der Auswertung als externen Link freigeben
// (setreo-cloud.com/<mandant>/<projekt>), optional passwortgeschützt.
// Externe sehen nur Karte + Auswertung — keine Admin-Ansicht.
// Kompakte Section — lebt als Footer in der Aktionsleisten-Card (stabile Layout-Höhe).

import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Globe2, Link2, Lock, LockOpen, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Input, Label } from "@/components/ui/Input"
import { useProjectStore } from "@/store/projects"
import type { Project } from "@/types/domain"

export function PublishCard({ project }: { project: Project }) {
  const publishProject = useProjectStore((s) => s.publishProject)
  const revokeShare = useProjectStore((s) => s.revokeShare)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const share = project.share

  const submit = async () => {
    setBusy(true)
    try {
      await publishProject(project.id, password.trim() || undefined)
      toast.success(share ? "Freigabe aktualisiert." : "Projekt veröffentlicht.")
      setDialogOpen(false)
      setPassword("")
    } catch {
      toast.error("Veröffentlichen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await revokeShare(project.id)
      toast.success("Freigabe gelöscht — der Link ist nicht mehr erreichbar.")
    } catch {
      toast.error("Freigabe konnte nicht gelöscht werden.")
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!share) return
    await navigator.clipboard.writeText(share.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {share ? (
        <>
          {/* Kopfzeile mit Aktionen rechts — kompakt */}
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary-50 p-2 text-primary-700">
              <Globe2 className="h-4 w-4" />
            </span>
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-neutral-900">
              Veröffentlicht
              {share.hatPasswort ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
                  <Lock className="h-3 w-3" /> passwortgeschützt
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400">
                  <LockOpen className="h-3 w-3" /> ohne Passwort
                </span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" /> Bearbeiten
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove()}
              disabled={busy}
              className="text-severity-kritisch hover:bg-severity-kritisch-bg"
            >
              <Trash2 className="h-3.5 w-3.5" /> Löschen
            </Button>
          </div>

          {/* URL + Kopieren */}
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700">
              {share.url}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy()}
              aria-label="Link kopieren"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-lg bg-neutral-100 p-2 text-neutral-500">
              <Link2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">Für Externe freigeben</p>
              <p className="text-xs text-neutral-500">
                Erzeugt einen Link, über den Dritte Karte + Auswertung sehen (optional mit
                Passwort).
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => setDialogOpen(true)}
          >
            <Globe2 className="h-4 w-4" /> Veröffentlichen
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="sm">
        <DialogHeader
          title={share ? "Freigabe bearbeiten" : "Projekt veröffentlichen"}
          subtitle="Karte + Auswertung werden über einen externen Link zugänglich."
          onClose={() => setDialogOpen(false)}
        />
        <div className="px-6 py-5">
          <Label htmlFor="share-pw">Passwort (optional)</Label>
          <Input
            id="share-pw"
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              share?.hatPasswort
                ? "Neues Passwort — leer = ohne Passwort"
                : "Leer lassen für Link ohne Passwort"
            }
          />
          <p className="mt-1.5 text-xs text-neutral-400">
            Mit Passwort müssen Empfänger es vor dem Öffnen eingeben.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {share ? "Speichern" : "Veröffentlichen"}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
