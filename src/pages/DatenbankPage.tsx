// Datenbank — eine Ansicht: oben der "Aktualisieren"-Block (Datenquellen-Sync),
// darunter die Übersichtskarte der zentralen Hindernis-Datenbank (alles, zoombar,
// geclustert). Keine Funde-/Auswertungs-Tabelle hier — Funde leben im Projekt.

import { useQuery } from "@tanstack/react-query"
import { Database, Map as MapIcon } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { EmptyState } from "@/components/shared/EmptyState"
import { SyncBar } from "@/components/db/SyncBar"
import { ObstaclesMap } from "@/components/map/ObstaclesMap"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"

export function DatenbankPage() {
  const mode = useDataSourceStore((s) => s.mode)
  const live = mode === "live"

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Datenquellen aktualisieren und gemeldete Ereignisse (Baustellen, Sperrungen) auf der Karte. Permanente Infrastruktur wird mitgeführt, hier aber nicht angezeigt."
        width="wide"
      >
        <div className="flex flex-col gap-4">
          {live ? <SyncBar /> : null}
          <ObstacleKarte live={live} />
        </div>
      </PageContainer>
    </div>
  )
}

function ObstacleKarte({ live }: { live: boolean }) {
  // Nur gemeldete, aktive Ereignisse (Baustellen/Sperrungen) — die permanente
  // Infrastruktur (Brücken/Tunnel/Ampeln/Gewichtslimits …) ziehen wir zwar mit,
  // wird auf der Übersichtskarte aber bewusst nicht angezeigt.
  const obstacles = useQuery({
    queryKey: ["obstacles-alle", "gemeldet", "geom"],
    queryFn: () => api.listObstacles({ gemeldet: true, aktiv: true, geom: true }),
    enabled: live,
    staleTime: 60_000,
  })

  if (!live) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Hindernis-Datenbank nicht verbunden"
        description="Die zentrale Hindernis-Datenbank lebt im Backend. Im Demo-Modus (ohne Server) ist die Übersichtskarte nicht verfügbar."
      />
    )
  }

  if (obstacles.isLoading) {
    // Ladebalken: der Bestand kann groß sein (zehntausende Einträge) und braucht
    // einen Moment zum Herunterladen — sichtbar machen statt "leer".
    return (
      <div className="flex h-[calc(100vh-360px)] min-h-[420px] flex-col items-center justify-center gap-4 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-600">
          <Database className="h-4 w-4 text-primary-500" />
          Hindernis-Datenbank wird geladen …
        </div>
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-primary-500" />
        </div>
        <p className="text-xs text-neutral-400">Alle Einträge werden geladen und auf der Karte gebündelt.</p>
      </div>
    )
  }

  if (obstacles.isError) {
    return (
      <EmptyState
        icon={Database}
        title="Daten konnten nicht geladen werden"
        description="Die Hindernis-Datenbank ist gerade nicht erreichbar. Bitte später erneut versuchen."
      />
    )
  }

  return (
    <div className="h-[calc(100vh-360px)] min-h-[420px]">
      <ObstaclesMap obstacles={obstacles.data ?? []} />
    </div>
  )
}
