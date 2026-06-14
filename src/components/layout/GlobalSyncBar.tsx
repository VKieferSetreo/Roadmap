// Dünner globaler Ladebalken ganz oben am Viewport — auf ALLEN Screens sichtbar,
// solange irgendetwas Längeres läuft:
//   • der zentrale Sync (Daten aktualisieren): Import bestimmt (done/total),
//     Verify/Hygiene/Rerun unbestimmt.
//   • eine Projekt-Auswertung („Erneut auswerten" / „Auswertung starten"): unbestimmt.
// Per Portal an document.body (über allem, unter Dialogen). Rein lesend — getrieben
// vom geteilten Sync-Cache + dem Projects-Store; triggert nichts selbst.

import { useQuery } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { api } from "@/api/roadmap"
import { useProjectStore } from "@/store/projects"

export function GlobalSyncBar() {
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    refetchInterval: 30_000,
  })
  const activeJobId = status.data?.activeJobId ?? null
  const job = useQuery({
    queryKey: ["sync-job", activeJobId],
    queryFn: () => api.sync.job(activeJobId as string),
    enabled: Boolean(activeJobId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1_000 : false),
  })

  const analyzing = useProjectStore((s) =>
    Object.values(s.analysis ?? {}).some((a) => a?.running),
  )

  const syncJob = job.data
  const syncing = Boolean(activeJobId) && syncJob?.status === "running"
  if (!syncing && !analyzing) return null

  // Bestimmter Fortschritt nur in der Import-Phase des Sync; sonst (Verify/Hygiene/
  // Rerun/Auswertung) unbestimmt = gleitender Balken.
  const importing = Boolean(syncing) && syncJob?.phase === "import"
  const pct = importing && syncJob?.total
    ? Math.round((syncJob.done / syncJob.total) * 100)
    : 100

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[1600] h-1 overflow-hidden bg-primary-100/70"
      role="progressbar"
      aria-label="Daten werden aktualisiert"
    >
      {importing ? (
        <div
          className="h-full bg-primary-500 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-primary-500" />
      )}
    </div>,
    document.body,
  )
}
