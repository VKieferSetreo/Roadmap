// Datenbank — eine Ansicht: oben der "Aktualisieren"-Block (Datenquellen-Sync),
// darunter die Übersichtskarte der zentralen Hindernis-Datenbank (alles, zoombar,
// geclustert). Keine Funde-/Auswertungs-Tabelle hier — Funde leben im Projekt.

import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, Database, Map as MapIcon, BarChart3, ListTree, Search, X, Activity } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { EmptyState } from "@/components/shared/EmptyState"
import { SyncBar } from "@/components/db/SyncBar"
import { AbdeckungBoard } from "@/components/db/AbdeckungBoard"
import { AnalyticsBoard } from "@/components/db/AnalyticsBoard"
import { OrtsSuche, type OrtTreffer } from "@/components/db/OrtsSuche"
import { QuellenRegister } from "@/components/db/QuellenRegister"
import { ObstaclesMap } from "@/components/map/ObstaclesMap"
import { Input } from "@/components/ui/Input"
import { attrEntries } from "@/components/project/findingMeta"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"
import { useSourceHealth } from "@/lib/sourceHealth"
import { useDebounce } from "@/hooks/useDebounce"
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
  const erlaubteTabs = intern ? (isAdmin ? ["abdeckung", "analytics", "quellen"] : ["quellen"]) : []
  const tab = wunsch && erlaubteTabs.includes(wunsch) ? wunsch : "ansicht"
  const { unreachable } = useSourceHealth()

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Datenquellen aktualisieren und alle Einträge auf der Karte sehen."
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
                <>
                  <TabsTrigger value="abdeckung">
                    <BarChart3 className="h-4 w-4" /> Abdeckung
                  </TabsTrigger>
                  <TabsTrigger value="analytics">
                    <Activity className="h-4 w-4" /> Analytics
                  </TabsTrigger>
                </>
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
        ) : tab === "analytics" ? (
          <AnalyticsBoard />
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

  const [suche, setSuche] = useState("")
  // T-307: nach dem debounced Wert filtern — sonst baut ObstaclesMap den markercluster (zehntausende
  // Pins) bei JEDEM Tastendruck neu. Das Eingabefeld bleibt sofort responsiv (zeigt `suche`).
  const sucheDebounced = useDebounce(suche, 250)
  const [flyTo, setFlyTo] = useState<OrtTreffer | undefined>()
  const alle = useMemo(() => obstacles.data ?? [], [obstacles.data])
  // Inhaltssuche über alle geladenen (aktiven) Hindernisse — Text + Maße (attrs).
  // Komma→Punkt, damit "4,5" die als 4.5 gespeicherte Höhe findet; attrEntries liefert
  // zusätzlich die formatierte Form ("4,5 m") + Labels ("Durchfahrtshöhe").
  const gefiltert = useMemo(() => {
    const s = sucheDebounced.trim().toLowerCase().replace(/,/g, ".")
    if (!s) return alle
    return alle.filter((o) => {
      const hay = [
        o.name, o.beschreibung, o.strassenRef, o.zustaendig, o.fachId, o.quelle?.name,
        ...attrEntries(o.attrs).flatMap((e) => [e.label, e.value]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/,/g, ".")
      return hay.includes(s)
    })
  }, [alle, sucheDebounced])

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
    <div className="flex flex-col gap-3">
      <div className="h-[calc(100vh-360px)] min-h-[440px]">
        <ObstaclesMap obstacles={gefiltert} onDelete={deleteObstacle} flyTo={flyTo}>
          {/* Suchleisten IN der Karte (links Ort = schwenkt, rechts Inhalt = filtert). Liegen im
              Karten-Wrapper → bleiben auch im Vollbild sichtbar; rechts bleibt Platz für den
              Vollbild-Button. Auf kleinen Schirmen untereinander. */}
          <div className="absolute left-3 top-3 z-[1200] flex w-[min(42rem,calc(100%-4.75rem))] flex-col gap-2 sm:flex-row">
            <div className="rounded-md shadow-lg sm:flex-1">
              <OrtsSuche onSelect={setFlyTo} />
            </div>
            <div className="relative rounded-md bg-white shadow-lg sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="In Einträgen suchen …"
                className="bg-white pl-9"
                aria-label="Hindernis-Datenbank nach Inhalten durchsuchen"
              />
              {suche ? (
                <button
                  onClick={() => setSuche("")}
                  aria-label="Suche leeren"
                  title="Suche leeren"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-neutral-400 hover:text-neutral-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </ObstaclesMap>
      </div>
    </div>
  )
}
