// Erreichbarkeits-Signal der Datenquellen für Warn-Indikatoren (DB-Nav + Ansicht-Tab).
//
// Quelle der Wahrheit ist der Status des letzten automatischen Import-Laufs (Worker 8/12/18 Uhr
// = 3×/Tag). Teilt sich den ["sync-status"]-Cache mit der SyncBar (selber Query-Key).
//
// T-679: gezählt wurde nur "error", und das ist der seltenste Fall. Gemessen am 05.09.2026 stand
// der Indikator auf grün, obwohl sechs Quellen seit Wochen nichts mehr lieferten: 62 ok, 5 warn,
// 1 partial, 0 error. Eine Quelle, die ihren Abruf halb schafft oder mit Warnung endet, ist für
// den Nutzer dasselbe wie eine, die gar nicht antwortet — ihre Daten sind nicht frisch.

import { useQuery } from "@tanstack/react-query"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"

/** Läufe, nach denen die Daten einer Quelle NICHT frisch sind (T-679). */
export const OHNE_FRISCHE_DATEN = new Set(["error", "warn", "partial"])

export function useSourceHealth(): { unreachable: number; total: number } {
  // Beide Store-Hooks IMMER aufrufen (kein && davor — sonst Conditional-Hook: bei mode
  // "checking"→"live" springt die Hook-Anzahl und React crasht). Nur intern + live relevant:
  // der externe Kunden-Gateway darf /sync/status nicht abfragen.
  const mode = useDataSourceStore((s) => s.mode)
  const extern = useContextStore((s) => s.extern)
  const enabled = mode === "live" && !extern
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.sync.status(),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // ~5 min: den 3×/Tag-Stand ohne manuelles Neuladen einsammeln
  })
  const aktiv = (status.data?.quellen ?? []).filter((q) => q.connector)
  return {
    unreachable: aktiv.filter((q) => OHNE_FRISCHE_DATEN.has(String(q.letzterStatus))).length,
    total: aktiv.length,
  }
}
