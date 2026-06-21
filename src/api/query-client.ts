// TanStack QueryClient — defaults für staleTime/retry/refetchOnWindowFocus.

import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "./client"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s
      gcTime: 5 * 60 * 1000, // 5 min Cache-Retention
      retry: (failureCount, error) => {
        // Keine Retries bei 4xx (außer 429 = rate-limit)
        if (error instanceof ApiError) {
          if (error.status >= 400 && error.status < 500 && error.status !== 429) return false
        }
        return failureCount < 1
      },
      // T-375: Default AUS — sonst refetchen auch schwere Listen (obstacles 39k, findings) bei jedem
      // Fenster-Fokus und hämmern die API. Queries, die echt fokus-frisch sein müssen (Glocke,
      // Sync-Status, Header-Sync), setzen refetchOnWindowFocus: true explizit und behalten es.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
})
