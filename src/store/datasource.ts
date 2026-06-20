// Datenquellen-Erkennung: Backend erreichbar → "live" (Postgres), sonst → "demo"
// (lokaler Mock-Store). Wird einmal beim App-Start geprüft; UI zeigt den Modus an.

import { create } from "zustand"
import { api } from "@/api/roadmap"

export type DataSourceMode = "checking" | "live" | "demo"

interface DataSourceStore {
  mode: DataSourceMode
  /** Engine-/API-Version vom Health-Endpoint (nur live). */
  apiVersion?: string
  /** Demo-Fallback kam durch ein NICHT erreichbares/ungesundes Backend zustande (T-447) —
   *  zu unterscheiden vom bewussten Demo-Modus ohne Backend (lokale Vorschau). */
  backendDown: boolean
  detect: () => Promise<"live" | "demo">
}

export const useDataSourceStore = create<DataSourceStore>((set, get) => ({
  mode: "checking",
  backendDown: false,

  detect: async () => {
    // Nur einmal prüfen — Re-Detect wäre über window-Reload sauberer als Live-Flip.
    const current = get().mode
    if (current !== "checking") return current
    try {
      const h = await api.health()
      const healthy = h.ok && h.db
      const mode: DataSourceMode = healthy ? "live" : "demo"
      // Erreichbar, aber ungesund (DB weg o.ä.) → backendDown, damit eingeloggte Nutzer
      // keine Demo-Beispieldaten als echt serviert bekommen (T-447).
      set({ mode, apiVersion: h.version, backendDown: !healthy })
      return mode
    } catch {
      // Health gar nicht erreichbar → backendDown, falls ein eingeloggter Nutzer dahintersteckt.
      set({ mode: "demo", backendDown: true })
      return "demo"
    }
  },
}))

/** Bequemer Snapshot-Zugriff außerhalb von React (Stores, Callbacks). */
export const isLive = () => useDataSourceStore.getState().mode === "live"
