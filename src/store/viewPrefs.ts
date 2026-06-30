// Viewer-Voreinstellungen pro Account + Projekt (T-622). Aktuell: ausgeblendete Strecken im Ebenen-Panel
// der Karte. localStorage-Cache (sofortiges Hydrieren ohne Flackern) + geräteübergreifende Account-
// Persistenz übers Backend (viewer_route_prefs). Quelle der Wahrheit ist das Backend; der Cache wird beim
// Laden damit abgeglichen. Backend-Schreib nur live (Demo bleibt geräte-lokal).

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { api } from "@/api/roadmap"
import { isLive } from "./datasource"

const keyOf = (account: string, projectId: string) => `${account}:${projectId}`
// Debounce je (Account,Projekt) — Toggle-Spam fasst sich zu einem PUT zusammen (wie projects.scheduleSync).
// pending hält die letzte ungespeicherte Nutzlast, damit sie bei pagehide noch rausgeschickt werden kann.
const timers: Record<string, ReturnType<typeof setTimeout>> = {}
const pending: Record<string, { projectId: string; ids: string[] }> = {}

function flush(k: string) {
  const p = pending[k]
  if (!p) return
  delete pending[k]
  clearTimeout(timers[k])
  // Best effort: schlägt der Save fehl, bleibt der localStorage-Cache erhalten (kein Datenverlust lokal,
  // nur evtl. kein Cross-Device-Sync dieser einen Änderung). Kein Toast — der Toggle bleibt sichtbar wirksam.
  api.saveHiddenRoutes(p.projectId, p.ids).catch(() => {})
}

// Vor Tab-Schließen/Navigation noch ausstehende Saves rausschicken → der letzte Toggle landet auch dann
// im Backend, wenn er < 600 ms vor dem Reload kam (sonst überschriebe der nächste GET den frischen Cache).
if (typeof window !== "undefined") {
  const flushAll = () => Object.keys(pending).forEach(flush)
  window.addEventListener("pagehide", flushAll)
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll()
  })
}

// Cap gegen unbegrenztes Wachstum (jede (Account,Projekt)-Kombi legt einen Key an). Arrays sind winzig,
// aber wir deckeln auf die zuletzt geschriebenen ~300 Einträge.
const CAP = 300
const capped = (rec: Record<string, string[]>): Record<string, string[]> => {
  const keys = Object.keys(rec)
  if (keys.length <= CAP) return rec
  return Object.fromEntries(keys.slice(keys.length - CAP).map((k) => [k, rec[k]]))
}

interface ViewPrefsStore {
  /** key `${account}:${projectId}` → ausgeblendete route-ids. */
  hiddenRoutes: Record<string, string[]>
  getHidden: (account: string, projectId: string) => string[]
  /** Aus dem Backend übernehmen (kein Rückschreiben). */
  hydrate: (account: string, projectId: string, ids: string[]) => void
  /** Lokale Auswahl setzen + (live) debounced ans Backend speichern. */
  setHidden: (account: string, projectId: string, ids: string[]) => void
}

export const useViewPrefsStore = create<ViewPrefsStore>()(
  persist(
    (set, get) => ({
      hiddenRoutes: {},
      getHidden: (account, projectId) => get().hiddenRoutes[keyOf(account, projectId)] ?? [],
      hydrate: (account, projectId, ids) =>
        set((s) => ({ hiddenRoutes: capped({ ...s.hiddenRoutes, [keyOf(account, projectId)]: ids }) })),
      setHidden: (account, projectId, ids) => {
        const k = keyOf(account, projectId)
        set((s) => ({ hiddenRoutes: capped({ ...s.hiddenRoutes, [k]: ids }) }))
        if (!isLive()) return // Demo: nur lokal
        pending[k] = { projectId, ids }
        clearTimeout(timers[k])
        timers[k] = setTimeout(() => flush(k), 600)
      },
    }),
    { name: "roadmap-view-prefs", storage: createJSONStorage(() => localStorage) },
  ),
)
