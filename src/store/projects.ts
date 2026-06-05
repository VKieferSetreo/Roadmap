// Mock-Projekt-Store (zustand + persist). Einzige Datenquelle im Frontend-only-Stand.
// `analysis` (laufender Fortschritt) wird NICHT persistiert.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { Project, RouteInput, TransportData, TransportZeitraum } from "@/types/domain"
import { DEFAULT_TRANSPORT } from "@/types/domain"
import { runMockAnalysis } from "@/lib/mock/generate"
import { buildSeedProjects } from "@/lib/mock/seed"

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

interface AnalysisState {
  running: boolean
  progress: number
  step: string
}

const ANALYSE_SCHRITTE = [
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

  seedIfEmpty: () => void
  resetToSeed: () => void
  getProject: (id: string) => Project | undefined
  createProject: (name: string) => Project
  renameProject: (id: string, name: string) => void
  removeProject: (id: string) => void
  updateRoute: (id: string, patch: Partial<RouteInput>) => void
  updateTransport: (id: string, patch: Partial<TransportData>) => void
  updateZeitraum: (id: string, patch: Partial<TransportZeitraum>) => void
  runAnalysis: (id: string) => void
}

// laufende Intervalle außerhalb des States halten (nicht serialisierbar)
const timers: Record<string, ReturnType<typeof setInterval>> = {}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      analysis: {},
      seeded: false,

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

      createProject: (name) => {
        const project: Project = {
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
        }
        set((s) => ({ projects: [project, ...s.projects] }))
        return project
      },

      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: name.trim(), updatedAt: now() } : p,
          ),
        })),

      removeProject: (id) => {
        if (timers[id]) {
          clearInterval(timers[id])
          delete timers[id]
        }
        set((s) => {
          const analysis = { ...s.analysis }
          delete analysis[id]
          return { projects: s.projects.filter((p) => p.id !== id), analysis }
        })
      },

      updateRoute: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, route: { ...p.route, ...patch }, updatedAt: now() } : p,
          ),
        })),

      updateTransport: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, transport: { ...p.transport, ...patch }, updatedAt: now() }
              : p,
          ),
        })),

      updateZeitraum: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, zeitraum: { ...p.zeitraum, ...patch }, updatedAt: now() }
              : p,
          ),
        })),

      runAnalysis: (id) => {
        const project = get().getProject(id)
        if (!project) return
        if (timers[id]) clearInterval(timers[id])

        set((s) => ({
          analysis: { ...s.analysis, [id]: { running: true, progress: 0, step: ANALYSE_SCHRITTE[0] } },
          projects: s.projects.map((p) => (p.id === id ? { ...p, status: "analyse" } : p)),
        }))

        timers[id] = setInterval(() => {
          const cur = get().analysis[id]
          if (!cur) return
          const next = Math.min(100, cur.progress + 6 + Math.random() * 10)
          const stepIdx = Math.min(
            ANALYSE_SCHRITTE.length - 1,
            Math.floor((next / 100) * ANALYSE_SCHRITTE.length),
          )

          if (next >= 100) {
            clearInterval(timers[id])
            delete timers[id]
            const p = get().getProject(id)
            if (!p) return
            const res = runMockAnalysis(p.route, p.transport)
            set((s) => ({
              analysis: { ...s.analysis, [id]: { running: false, progress: 100, step: "Fertig" } },
              projects: s.projects.map((pp) =>
                pp.id === id
                  ? {
                      ...pp,
                      status: "fertig",
                      routeGeometry: res.routeGeometry,
                      findings: res.findings,
                      distanzKm: res.distanzKm,
                      fahrzeitMin: res.fahrzeitMin,
                      updatedAt: now(),
                    }
                  : pp,
              ),
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
      },
    }),
    {
      name: "roadmap-projects",
      storage: createJSONStorage(() => localStorage),
      // analysis (laufende Timer-Fortschritte) nicht persistieren
      partialize: (s) => ({ projects: s.projects, seeded: s.seeded }),
    },
  ),
)
