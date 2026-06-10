// Projekt-Store (zustand + persist) mit zwei Datenquellen:
//  - "live": Backend/Postgres — optimistische Updates + debounced PATCH-Sync,
//    Analyse läuft serverseitig (echte Engine gegen die Hindernis-Datenbank).
//  - "demo": lokaler Mock (Frontend-only-Fallback, z.B. Dev ohne Server).
// `analysis` (laufender Fortschritt) wird NICHT persistiert.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { Project, RouteInput, TransportData, TransportZeitraum } from "@/types/domain"
import { DEFAULT_TRANSPORT } from "@/types/domain"
import { runMockAnalysis } from "@/lib/mock/generate"
import { buildSeedProjects } from "@/lib/mock/seed"
import { api } from "@/api/roadmap"
import { isLive } from "./datasource"

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

interface AnalysisState {
  running: boolean
  progress: number
  step: string
}

export const ANALYSE_SCHRITTE = [
  "Strecke wird aufgebaut …",
  "Geometrie wird abgefahren …",
  "Brücken & Tunnel werden geprüft …",
  "Engstellen & Schleppkurven werden berechnet …",
  "Gewichts- & Lastgrenzen werden abgeglichen …",
  "Ergebnis wird zusammengestellt …",
]

interface ProjectStore {
  projects: Project[]
  /** laufende Analysen je Projekt-ID (ephemer). */
  analysis: Record<string, AnalysisState>
  seeded: boolean
  /** true während der initiale Live-Load läuft (Skeletons). */
  loading: boolean

  /** Initial-Load: live → Projekte vom Server, demo → Seed wenn leer. */
  initData: (mode: "live" | "demo") => Promise<void>
  seedIfEmpty: () => void
  resetToSeed: () => void
  getProject: (id: string) => Project | undefined
  createProject: (name: string) => Promise<Project>
  renameProject: (id: string, name: string) => void
  removeProject: (id: string) => void
  updateRoute: (id: string, patch: Partial<RouteInput>) => void
  updateTransport: (id: string, patch: Partial<TransportData>) => void
  updateZeitraum: (id: string, patch: Partial<TransportZeitraum>) => void
  runAnalysis: (id: string) => void
}

// Laufende Intervalle + Sync-Debounces außerhalb des States (nicht serialisierbar).
const timers: Record<string, ReturnType<typeof setInterval>> = {}
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}

/** Debounced Server-Sync: schickt den aktuellen Stand des Projekts als Merge-PATCH. */
function scheduleSync(id: string, get: () => ProjectStore) {
  if (!isLive()) return
  if (syncTimers[id]) clearTimeout(syncTimers[id])
  syncTimers[id] = setTimeout(() => {
    delete syncTimers[id]
    const p = get().getProject(id)
    if (!p) return
    api
      .patchProject(id, {
        name: p.name,
        route: p.route,
        transport: p.transport,
        zeitraum: p.zeitraum,
      })
      .catch(() => {
        toast.error("Änderung konnte nicht gespeichert werden — Verbindung prüfen.")
      })
  }, 600)
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      analysis: {},
      seeded: false,
      loading: false,

      initData: async (mode) => {
        if (mode === "demo") {
          get().seedIfEmpty()
          return
        }
        set({ loading: true })
        try {
          const projects = await api.listProjects()
          set({ projects, loading: false, seeded: true })
        } catch {
          set({ loading: false })
          toast.error("Projekte konnten nicht geladen werden.")
        }
      },

      seedIfEmpty: () => {
        if (get().seeded || get().projects.length > 0) {
          if (!get().seeded) set({ seeded: true })
          return
        }
        set({ projects: buildSeedProjects(), seeded: true })
      },

      resetToSeed: () => {
        Object.keys(timers).forEach((id) => {
          clearInterval(timers[id])
          delete timers[id]
        })
        set({ projects: buildSeedProjects(), analysis: {}, seeded: true })
      },

      getProject: (id) => get().projects.find((p) => p.id === id),

      createProject: async (name) => {
        const fallback = (): Project => ({
          id: uid(),
          name: name.trim(),
          status: "entwurf",
          createdAt: now(),
          updatedAt: now(),
          route: { mode: "startziel", vias: [] },
          transport: { ...DEFAULT_TRANSPORT },
          zeitraum: {},
          routeGeometry: [],
          findings: [],
        })

        if (isLive()) {
          try {
            const project = await api.createProject(name.trim())
            set((s) => ({ projects: [project, ...s.projects] }))
            return project
          } catch {
            toast.error("Projekt konnte nicht auf dem Server angelegt werden — lokal angelegt.")
          }
        }
        const project = fallback()
        set((s) => ({ projects: [project, ...s.projects] }))
        return project
      },

      renameProject: (id, name) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: name.trim(), updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get)
      },

      removeProject: (id) => {
        if (timers[id]) {
          clearInterval(timers[id])
          delete timers[id]
        }
        if (syncTimers[id]) {
          clearTimeout(syncTimers[id])
          delete syncTimers[id]
        }
        set((s) => {
          const analysis = { ...s.analysis }
          delete analysis[id]
          return { projects: s.projects.filter((p) => p.id !== id), analysis }
        })
        if (isLive()) {
          api.deleteProject(id).catch(() => {
            toast.error("Projekt konnte auf dem Server nicht gelöscht werden.")
          })
        }
      },

      updateRoute: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, route: { ...p.route, ...patch }, updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get)
      },

      updateTransport: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, transport: { ...p.transport, ...patch }, updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get)
      },

      updateZeitraum: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, zeitraum: { ...p.zeitraum, ...patch }, updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get)
      },

      runAnalysis: (id) => {
        const project = get().getProject(id)
        if (!project) return
        if (timers[id]) clearInterval(timers[id])

        set((s) => ({
          analysis: {
            ...s.analysis,
            [id]: { running: true, progress: 0, step: ANALYSE_SCHRITTE[0] },
          },
          projects: s.projects.map((p) => (p.id === id ? { ...p, status: "analyse" } : p)),
        }))

        const finish = (apply: (p: Project) => Project) => {
          clearInterval(timers[id])
          delete timers[id]
          set((s) => ({
            analysis: { ...s.analysis, [id]: { running: false, progress: 100, step: "Fertig" } },
            projects: s.projects.map((pp) => (pp.id === id ? apply(pp) : pp)),
          }))
        }

        const fail = (message: string) => {
          clearInterval(timers[id])
          delete timers[id]
          set((s) => {
            const analysis = { ...s.analysis }
            delete analysis[id]
            return {
              analysis,
              projects: s.projects.map((p) =>
                p.id === id ? { ...p, status: p.findings.length > 0 ? "fertig" : "entwurf" } : p,
              ),
            }
          })
          toast.error(message)
        }

        const live = isLive()

        // Fortschritts-Animation. Demo: treibt die Analyse selbst (wie bisher).
        // Live: läuft als Begleiter bis max. 92% — der Server-Response schließt ab.
        timers[id] = setInterval(() => {
          const cur = get().analysis[id]
          if (!cur || !cur.running) return
          const cap = live ? 92 : 100
          const next = Math.min(cap, cur.progress + 6 + Math.random() * 10)
          const stepIdx = Math.min(
            ANALYSE_SCHRITTE.length - 1,
            Math.floor((next / 100) * ANALYSE_SCHRITTE.length),
          )

          if (!live && next >= 100) {
            // Demo-Abschluss: deterministischer Mock im Frontend.
            const p = get().getProject(id)
            if (!p) return
            // Vor dem Sync sicherstellen, dass der letzte Eingabe-Stand verwendet wird.
            const res = runMockAnalysis(p.route, p.transport)
            finish((pp) => ({
              ...pp,
              status: "fertig",
              routeGeometry: res.routeGeometry,
              findings: res.findings,
              distanzKm: res.distanzKm,
              fahrzeitMin: res.fahrzeitMin,
              updatedAt: now(),
            }))
          } else {
            set((s) => ({
              analysis: {
                ...s.analysis,
                [id]: { running: true, progress: next, step: ANALYSE_SCHRITTE[stepIdx] },
              },
            }))
          }
        }, 420)

        if (live) {
          // Ausstehende Eingabe-Syncs sofort flushen, damit die Engine den letzten Stand sieht.
          const pending = syncTimers[id]
          if (pending) {
            clearTimeout(pending)
            delete syncTimers[id]
          }
          const p = get().getProject(id)
          const sync = p
            ? api.patchProject(id, {
                name: p.name,
                route: p.route,
                transport: p.transport,
                zeitraum: p.zeitraum,
              })
            : Promise.resolve(null)

          sync
            .then(() => api.runAnalysis(id))
            .then((updated) => finish(() => updated))
            .catch(() =>
              fail("Analyse fehlgeschlagen — Server nicht erreichbar oder Fehler in der Engine."),
            )
        }
      },
    }),
    {
      name: "roadmap-projects",
      storage: createJSONStorage(() => localStorage),
      // analysis (laufende Timer-Fortschritte) + loading nicht persistieren
      partialize: (s) => ({ projects: s.projects, seeded: s.seeded }),
    },
  ),
)
