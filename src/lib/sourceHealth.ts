// Erreichbarkeits-Signal der Datenquellen für Warn-Indikatoren (DB-Nav + Ansicht-Tab).
//
// Quelle der Wahrheit ist der Status des letzten automatischen Import-Laufs (Worker 8/12/18 Uhr
// = 3×/Tag): schlägt der Abruf einer Quelle fehl, steht ihr letzterStatus auf "error" → die Quelle
// ist nicht erreichbar. Teilt sich den ["sync-status"]-Cache mit der SyncBar (selber Query-Key).

import { useQuery } from "@tanstack/react-query"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"

export function useSourceHealth(): { unreachable: number; total: number } {
  // Nur intern + live relevant: der externe Kunden-Gateway darf /sync/status nicht abfragen.
  const enabled = useDataSourceStore((s) => s.mode) === "live" && !useContextStore((s) => s.extern)
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // ~5 min: den 3×/Tag-Stand ohne manuelles Neuladen einsammeln
  })
  const aktiv = (status.data?.quellen ?? []).filter((q) => q.connector)
  return {
    unreachable: aktiv.filter((q) => q.letzterStatus === "error").length,
    total: aktiv.length,
  }
}
