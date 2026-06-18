// Datenbank — eine Ansicht: oben der "Aktualisieren"-Block (Datenquellen-Sync),
// darunter die Übersichtskarte der zentralen Hindernis-Datenbank (alles, zoombar,
// geclustert). Keine Funde-/Auswertungs-Tabelle hier — Funde leben im Projekt.

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, Database, Map as MapIcon, BarChart3, ListTree } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { EmptyState } from "@/components/shared/EmptyState"
import { SyncBar } from "@/components/db/SyncBar"
import { AbdeckungBoard } from "@/components/db/AbdeckungBoard"
import { QuellenRegister } from "@/components/db/QuellenRegister"
import { ObstaclesMap } from "@/components/map/ObstaclesMap"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"
import { useSourceHealth } from "@/lib/sourceHealth"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"

export function DatenbankPage() {
  const mode = useDataSourceStore((s) => s.mode)
  const live = mode === "live"
  // Abdeckung + Quellenregister nur für Setreo-intern (kein externer Kunden-Gateway).
  // Abdeckung zusätzlich nur für Admins (mxk/vki) — normale interne Nutzer brauchen nur
  // Ansicht + Quellenregister (Max 2026-06-18). Die "Ansicht" (Karte + Sync) ist immer sichtbar.
  const intern = !useContextStore((s) => s.extern)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const [params, setParams] = useSearchParams()
  const wunsch = params.get("tab")
  const erlaubteTabs = intern ? (isAdmin ? ["abdeckung", "quellen"] : ["quellen"]) : []
  const tab = wunsch && erlaubteTabs.includes(wunsch) ? wunsch : "ansicht"
  const { unreachable } = useSourceHealth()

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Datenquellen aktualisieren und alle Einträge auf der Karte (Baustellen, Sperrungen, lastbeschränkte Brücken …) — plus Datenabdeckung und Quellenregister."
        width="wide"
      >
        {intern ? (
          <Tabs
            value={tab}
            onValueChange={(v) => setParams(v === "ansicht" ? {} : { tab: v }, { replace: true })}
            className="mb-4"
          >
            <TabsList>
              <TabsTrigger value="ansicht">
                <MapIcon className="h-4 w-4" /> Ansicht
                {unreachable > 0 ? (
                  <span
                    title={`${unreachable} Datenquelle${unreachable === 1 ? "" : "n"} mit Fehler beim letzten Abruf`}
                    className="ml-1 inline-flex items-center text-severity-kritisch"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </TabsTrigger>
              {isAdmin ? (
                <TabsTrigger value="abdeckung">
                  <BarChart3 className="h-4 w-4" /> Abdeckung
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="quellen">
                <ListTree className="h-4 w-4" /> Quellenregister
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        {tab === "ansicht" ? (
          <div className="flex flex-col gap-4">
            {live ? <SyncBar /> : null}
            <ObstacleKarte live={live} />
          </div>
        ) : tab === "abdeckung" ? (
          <AbdeckungBoard />
        ) : (
          <QuellenRegister />
        )}
      </PageContainer>
    </div>
  )
}

function ObstacleKarte({ live }: { live: boolean }) {
  // ALLE aktiven Einträge anzeigen — gemeldete Ereignisse (Baustellen/Sperrungen) UND
  // permanente Infrastruktur (lastbeschränkte Brücken, Tunnel, Gewichtslimits, GST …).
  // Max-Vorgabe: auf der Übersichtskarte nichts mehr rausfiltern.
  const queryClient = useQueryClient()
  const obstacles = useQuery({
    queryKey: ["obstacles-alle", "geom"],
    queryFn: () => api.listObstacles({ aktiv: true, geom: true }),
    enabled: live,
    staleTime: 60_000,
  })

  // Stabile Referenz: sonst würde ObstaclesMap das markercluster-Layer bei JEDEM
  // Re-Render neu aufbauen (useEffect-Dep) → Flackern/Marker-Verlust.
  const deleteObstacle = useCallback(
    async (id: string) => {
      try {
        await api.deleteObstacle(id)
        toast.success("Eigener Eintrag verworfen.")
        await queryClient.invalidateQueries({ queryKey: ["obstacles-alle"] })
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Verwerfen fehlgeschlagen.")
      }
    },
    [queryClient],
  )

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
      <ObstaclesMap obstacles={obstacles.data ?? []} onDelete={deleteObstacle} />
    </div>
  )
}
