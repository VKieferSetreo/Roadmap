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
import { cn } from "@/lib/cn"
import type { Project } from "@/types/domain"

export function PublishCard({ project }: { project: Project }) {
  const publishProject = useProjectStore((s) => s.publishProject)
  const revokeShare = useProjectStore((s) => s.revokeShare)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const share = project.share
  const live = Boolean(share)

  // Status-Badge (oben rechts, wie die „Tage" beim Transport-Zeitraum): Live = freigegeben.
  const statusBadge = (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] font-semibold",
        live
          ? "border-primary-100 bg-primary-50/60 text-primary-800"
          : "border-neutral-200 bg-neutral-100 text-neutral-500",
      )}
    >
      {live ? "Live" : "Offline"}
    </span>
  )

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
    // T-235: Widerrufen tötet einen ggf. an Kunden/Behörden verteilten Link sofort → bestätigen.
    if (!window.confirm("Freigabe wirklich löschen? Der bereits geteilte Link wird sofort unerreichbar.")) return
    setBusy(true)
    try {
      await revokeShare(project.id)
      toast.success("Freigabe gelöscht. Der Link ist nicht mehr erreichbar.")
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
    <div className="flex h-full flex-col gap-2.5">
      {share ? (
        <>
          {/* Kopfzeile mit Aktionen rechts — kompakt, umbruchsicher */}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
              {/* Globe inline (kein grünes Tile) — wie die anderen Karten-Header (Max 2026-06-29). */}
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <Globe2 className="h-4 w-4 text-primary-600" /> Veröffentlicht
              </span>
              {share.hatPasswort ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-neutral-500">
                  <Lock className="h-3 w-3" /> passwortgeschützt
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-neutral-400">
                  <LockOpen className="h-3 w-3" /> ohne Passwort
                </span>
              )}
            </div>
            {/* Live/Offline-Badge links neben den Icon-Aktionen, gleiche Höhe (h-7) wie die Dauer-Marke. */}
            {statusBadge}
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={busy}
              title="Bearbeiten"
              aria-label="Freigabe bearbeiten"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              title="Löschen"
              aria-label="Freigabe löschen"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* URL + Kopieren */}
          <div className="flex items-center gap-2">
            <code
              title={share.url}
              className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700"
            >
              {share.url}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy()}
              aria-label="Link kopieren"
              className="shrink-0"
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
        <>
          {/* Kopfzeile wie „Transport-Zeitraum": Icon + Überschrift links, Status rechts */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <Link2 className="h-4 w-4 text-primary-600" /> Für Externe freigeben
            </span>
            {statusBadge}
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            Karte und Auswertung extern teilen, ohne Anmeldung. Optional mit Passwort.
            {/* T-236: Hinweis, dass erst eine abgeschlossene Auswertung teilbar ist (kein leerer Share). */}
            {project.status !== "fertig" ? (
              <span className="mt-1 block font-medium text-amber-700">
                Erst nach abgeschlossener Auswertung verfügbar.
              </span>
            ) : null}
          </p>
          {/* Button unten rechts — spiegelt die Dauer-Marke der Zeitraum-Karte */}
          <div className="mt-auto flex justify-end pt-1">
            <Button
              variant="outline"
              className="shrink-0"
              disabled={project.status !== "fertig"}
              onClick={() => setDialogOpen(true)}
            >
              <Globe2 className="h-4 w-4" /> Veröffentlichen
            </Button>
          </div>
        </>
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
                ? "Neues Passwort (leer = ohne Passwort)"
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
          <Button onClick={() => void submit()} loading={busy}>
            {share ? "Speichern" : "Veröffentlichen"}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
