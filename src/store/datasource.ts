// Datenquellen-Erkennung: Backend erreichbar → "live" (Postgres), sonst → "demo"
// (lokaler Mock-Store). Wird einmal beim App-Start geprüft; UI zeigt den Modus an.

import { create } from "zustand"
import { api } from "@/api/roadmap"

export type DataSourceMode = "checking" | "live" | "demo"

interface DataSourceStore {
  mode: DataSourceMode
  /** Engine-/API-Version vom Health-Endpoint (nur live). */
  apiVersion?: string
  detect: () => Promise<"live" | "demo">
}

export const useDataSourceStore = create<DataSourceStore>((set, get) => ({
  mode: "checking",

  detect: async () => {
    // Nur einmal prüfen — Re-Detect wäre über window-Reload sauberer als Live-Flip.
    const current = get().mode
    if (current !== "checking") return current
    try {
      const h = await api.health()
      const mode: DataSourceMode = h.ok && h.db ? "live" : "demo"
      set({ mode, apiVersion: h.version })
      return mode
    } catch {
      set({ mode: "demo" })
      return "demo"
    }
  },
}))

/** Bequemer Snapshot-Zugriff außerhalb von React (Stores, Callbacks). */
export const isLive = () => useDataSourceStore.getState().mode === "live"
