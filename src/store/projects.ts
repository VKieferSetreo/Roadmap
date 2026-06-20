// Projekt-Store (zustand + persist) mit zwei Datenquellen:
//  - "live": Backend/Postgres — optimistische Updates + debounced PATCH-Sync,
//    Analyse läuft serverseitig (Engine gegen die Hindernis-Datenbank), Tenant-gescoped.
//  - "demo": lokaler Mock (Frontend-only-Fallback, z.B. Dev ohne Server).
// `analysis` (laufender Fortschritt) wird NICHT persistiert.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { Finding, HideReason, Project, ProjectRoute, TransportData, TransportZeitraum } from "@/types/domain"
import { DEFAULT_TRANSPORT, ROUTE_FARBEN } from "@/types/domain"
import { runMockAnalysis } from "@/lib/mock/generate"
import { buildSeedProjects } from "@/lib/mock/seed"
import { api, type ProjectPatch } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import { isLive } from "./datasource"

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

interface AnalysisState {
  running: boolean
  progress: number
  step: string
}

export const ANALYSE_SCHRITTE = [
  "Strecken werden geladen …",
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
  loadError: boolean // T-228: letzter loadProjects ist mit Fehler gescheitert (≠ legitim leer)
  /** true während der initiale Live-Load läuft (Skeletons). */
  loading: boolean

  /** Initial-Load: live → Projekte vom Server, demo → Seed wenn leer. */
  initData: (mode: "live" | "demo") => Promise<void>
  /** Projekte (erneut) vom Server laden — z.B. nach Tenant-Wechsel. */
  loadProjects: () => Promise<void>
  seedIfEmpty: () => void
  resetToSeed: () => void
  getProject: (id: string) => Project | undefined
  createProject: (name: string) => Promise<Project>
  renameProject: (id: string, name: string) => void
  /** Projekt archivieren (true) bzw. wiederherstellen (false). */
  archiveProject: (id: string, archiviert: boolean) => void
  removeProject: (id: string) => void
  /** Projekt einem Ordner zuordnen (T-177); folderId=null → zurück auf Wurzelebene. */
  setProjectFolder: (id: string, folderId: string | null) => void

  /** Strecke hinzufügen (Farbe wird automatisch aus der Palette vergeben). */
  addRoute: (id: string, route: Omit<ProjectRoute, "id" | "farbe">) => void
  removeRoute: (id: string, routeId: string) => void
  renameRoute: (id: string, routeId: string, name: string) => void
  /** Strecke editieren (Name und/oder Geometrie) — Strecken-Editor. */
  updateRoute: (id: string, routeId: string, patch: Partial<Pick<ProjectRoute, "name" | "points">>) => void

  updateTransport: (id: string, patch: Partial<TransportData>) => void
  updateZeitraum: (id: string, patch: Partial<TransportZeitraum>) => void
  runAnalysis: (id: string) => void

  /** Veröffentlichen / Share-Link verwalten (nur live). */
  publishProject: (id: string, password?: string) => Promise<void>
  revokeShare: (id: string) => Promise<void>
  hideFinding: (projectId: string, finding: Finding, grund: HideReason, grundText?: string) => void
  unhideFinding: (projectId: string, finding: Finding) => void
}

// Laufende Intervalle + Sync-Debounces außerhalb des States (nicht serialisierbar).
const timers: Record<string, ReturnType<typeof setInterval>> = {}
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}

/** Debounced Server-Sync: schickt den aktuellen Stand des Projekts als Merge-PATCH. */
type SetState = (fn: (s: ProjectStore) => Partial<ProjectStore>) => void

/** Lokale Projekt-Version aus einer PATCH-Antwort übernehmen — MUSS nach jedem erfolgreichen
 *  PATCH passieren, sonst sendet der nächste PATCH eine veraltete Version und kollidiert mit
 *  sich selbst (T-466/T-501). */
function adoptVersion(set: SetState, id: string, version?: number) {
  if (version == null) return
  set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, version } : p)) }))
}

/** Server-PATCH mit Optimistic-Lock (T-466/T-501): bekannte Version mitsenden, Server-Version
 *  übernehmen, 409 (jemand anderes hat geändert) → Refetch + Hinweis statt stillem Verlust. */
function applyPatch(id: string, patch: ProjectPatch, get: () => ProjectStore, set: SetState): Promise<void> {
  const known = get().getProject(id)?.version
  return api
    .patchProject(id, { ...patch, version: known })
    .then((updated) => adoptVersion(set, id, updated.version))
    .catch((e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Das Projekt wurde zwischenzeitlich von jemand anderem geändert — wird neu geladen.")
        void get().loadProjects()
      } else {
        toast.error("Änderung konnte nicht gespeichert werden — Verbindung prüfen.")
      }
    })
}

function scheduleSync(id: string, get: () => ProjectStore, set: SetState) {
  if (!isLive()) return
  if (syncTimers[id]) clearTimeout(syncTimers[id])
  syncTimers[id] = setTimeout(() => {
    delete syncTimers[id]
    const p = get().getProject(id)
    if (!p) return
    void applyPatch(id, { name: p.name, routes: p.routes, transport: p.transport, zeitraum: p.zeitraum }, get, set)
  }, 600)
}

/** Nächste freie Strecken-Farbe (Palette der Reihe nach, Lücken zuerst). */
function nextFarbe(routes: ProjectRoute[]): string {
  const used = new Set(routes.map((r) => r.farbe))
  return ROUTE_FARBEN.find((f) => !used.has(f)) ?? ROUTE_FARBEN[routes.length % ROUTE_FARBEN.length]
}

// T-326: localStorage.setItem kann QuotaExceededError werfen (großer projects-Blob). Der würde
// sonst synchron aus einer optimistischen Mutation (addRoute/updateRoute) crashen und In-Memory
// von localStorage entkoppeln. Schlucken + einmalig warnen — der Server bleibt Source-of-Truth.
let quotaWarned = false
const safeStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      if (!quotaWarned) {
        quotaWarned = true
        toast.warning("Lokaler Speicher voll — Ihre Daten bleiben für diese Sitzung erhalten.")
      }
    }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      analysis: {},
      seeded: false,
      loading: false,
      loadError: false,

      initData: async (mode) => {
        if (mode === "demo") {
          get().seedIfEmpty()
          return
        }
        await get().loadProjects()
      },

      loadProjects: async () => {
        set({ loading: true, loadError: false })
        try {
          const projects = await api.listProjects()
          // projects IMMER als Array halten — sonst crasht jeder s.projects.find/[...projects]
          // (z.B. ProjectDetail, AppSidebar) beim Render, u.a. nach Mandantenwechsel.
          set({ projects: Array.isArray(projects) ? projects : [], loading: false, loadError: false, seeded: true })
        } catch {
          // T-228: loadError markieren → DashboardHome zeigt Fehler+Retry statt Erstanlage-Onboarding.
          set({ loading: false, loadError: true })
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

      getProject: (id) => (get().projects ?? []).find((p) => p.id === id),

      createProject: async (name) => {
        const fallback = (): Project => ({
          id: uid(),
          name: name.trim(),
          status: "entwurf",
          createdAt: now(),
          updatedAt: now(),
          routes: [],
          transport: { ...DEFAULT_TRANSPORT },
          zeitraum: {},
          findings: [],
        })

        if (isLive()) {
          try {
            const project = await api.createProject(name.trim())
            set((s) => ({ projects: [project, ...s.projects] }))
            return project
          } catch (e) {
            // T-230: im Live-Modus KEIN Phantom-Projekt mit lokaler uid() anlegen — das löste über
            // scheduleSync Dauer-404-PATCHes aus. Fehler melden + werfen (Aufrufer fängt ab).
            toast.error("Projekt konnte nicht angelegt werden — bitte erneut versuchen.")
            throw e instanceof Error ? e : new Error("createProject fehlgeschlagen")
          }
        }
        // Demo (kein Backend): lokales Projekt ist gewollt.
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
        scheduleSync(id, get, set)
      },

      archiveProject: (id, archiviert) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, archiviertAm: archiviert ? now() : null, updatedAt: now() } : p,
          ),
        }))
        if (isLive()) {
          api
            .patchProject(id, { archiviert })
            .then((updated) => adoptVersion(set, id, updated.version)) // T-501: Version mitführen
            .catch(() => {
              toast.error("Archiv-Status konnte nicht gespeichert werden.")
            })
        }
      },

      setProjectFolder: (id, folderId) => {
        const prev = get().getProject(id)?.folderId ?? null
        if (prev === folderId) return
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, folderId } : p)),
        }))
        if (isLive()) {
          api
            .patchProject(id, { folderId })
            .then((updated) => adoptVersion(set, id, updated.version)) // T-501: Version mitführen
            .catch(() => {
              toast.error("Verschieben konnte nicht gespeichert werden.")
              set((s) => ({
                projects: s.projects.map((p) => (p.id === id ? { ...p, folderId: prev } : p)),
              }))
            })
        }
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

      hideFinding: (projectId, finding, grund, grundText) => {
        const key = finding.key
        if (!key) {
          toast.error("Dieser Fund kann nicht ausgeblendet werden.")
          return
        }
        const patch = (hidden: boolean) =>
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    findings: p.findings.map((f) =>
                      f.key === key ? { ...f, hidden, hiddenGrund: grund, hiddenGrundText: grundText } : f,
                    ),
                  }
                : p,
            ),
          }))
        patch(true)
        if (isLive()) {
          api
            .hideFinding(projectId, {
              findingKey: key,
              obstacleId: finding.obstacleId ?? undefined,
              grund,
              grundText,
              kontext: {
                kategorie: finding.kategorie,
                titel: finding.titel,
                quelleName: finding.quelle?.name,
                strassenRef: finding.strassenRef,
              },
            })
            .catch(() => {
              toast.error("Ausblenden konnte nicht gespeichert werden.")
              patch(false)
            })
        }
      },

      unhideFinding: (projectId, finding) => {
        const key = finding.key
        if (!key) return
        const patch = (hidden: boolean) =>
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === projectId
                ? { ...p, findings: p.findings.map((f) => (f.key === key ? { ...f, hidden } : f)) }
                : p,
            ),
          }))
        patch(false)
        if (isLive()) {
          api.unhideFinding(projectId, key).catch(() => {
            toast.error("Wieder einblenden fehlgeschlagen.")
            patch(true)
          })
        }
      },

      addRoute: (id, route) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  routes: [...p.routes, { ...route, id: uid(), farbe: nextFarbe(p.routes) }],
                  updatedAt: now(),
                }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
      },

      removeRoute: (id, routeId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, routes: p.routes.filter((r) => r.id !== routeId), updatedAt: now() }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
      },

      renameRoute: (id, routeId, name) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  routes: p.routes.map((r) => (r.id === routeId ? { ...r, name } : r)),
                  updatedAt: now(),
                }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
      },

      updateRoute: (id, routeId, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  routes: p.routes.map((r) => (r.id === routeId ? { ...r, ...patch } : r)),
                  updatedAt: now(),
                }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
      },

      updateTransport: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, transport: { ...p.transport, ...patch }, updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get, set)
      },

      updateZeitraum: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, zeitraum: { ...p.zeitraum, ...patch }, updatedAt: now() } : p,
          ),
        }))
        scheduleSync(id, get, set)
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
          // T-234: Auswertung war bislang ohne Abschluss-Feedback — Erfolg klar melden.
          const n = get().getProject(id)?.findings.length ?? 0
          toast.success(
            n > 0
              ? `Auswertung abgeschlossen · ${n} Fund${n === 1 ? "" : "e"}`
              : "Auswertung abgeschlossen · keine Hindernisse gefunden",
          )
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

        // Fortschritts-Animation. Demo: treibt die Analyse selbst.
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
            const res = runMockAnalysis(p.routes, p.transport)
            finish((pp) => ({
              ...pp,
              status: "fertig",
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
          // Blind flushen (KEINE version) — der Nutzer will genau seinen aktuellen Stand auswerten;
          // ein version-409 hier wäre nicht von dem T-467-Analyse-409 unten zu unterscheiden. Die
          // server-seitig erhöhte version übernehmen wir trotzdem (T-501, kein Self-Conflict danach).
          const sync = p
            ? api
                .patchProject(id, {
                  name: p.name,
                  routes: p.routes,
                  transport: p.transport,
                  zeitraum: p.zeitraum,
                })
                .then((u) => adoptVersion(set, id, u.version))
            : Promise.resolve()

          sync
            .then(() => api.runAnalysis(id))
            .then((updated) => finish(() => updated))
            .catch((e) =>
              // T-467: 409 = für dieses Projekt läuft bereits eine Auswertung (Doppelklick /
              // zweiter Disponent / Kollision mit Nacht-Rerun) → klare Meldung statt „Server-Fehler".
              fail(
                e instanceof ApiError && e.status === 409
                  ? "Für dieses Projekt läuft bereits eine Auswertung — bitte kurz warten."
                  : "Analyse fehlgeschlagen — Server nicht erreichbar oder Fehler in der Engine.",
              ),
            )
        }
      },

      publishProject: async (id, password) => {
        if (!isLive()) {
          // Demo (kein Backend): Freigabe lokal simulieren, damit die Veröffentlichen-Box testbar ist.
          const share = {
            url: `https://setreo-cloud.com/demo/${id}`,
            hatPasswort: Boolean(password?.trim()),
            createdAt: new Date().toISOString(),
          }
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, share } : p)) }))
          return
        }
        const share = await api.publishProject(id, password)
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, share } : p)),
        }))
      },

      revokeShare: async (id) => {
        if (isLive()) await api.revokeShare(id)
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, share: null } : p)),
        }))
      },
    }),
    {
      name: "roadmap-projects",
      storage: createJSONStorage(() => safeStorage),
      version: 3,
      // Alt-Persists (inkl. v2-Projekt-Blob) verwerfen — Live lädt frisch vom Server, Demo baut neu.
      migrate: (state, version) => (version < 3 ? undefined : (state as ProjectStore)),
      // T-308 (Max-Entscheid 2026-06-20: Server ist Source-of-Truth, Demo darf neu aufbauen):
      // GAR NICHTS persistieren. Der projects-Array (findings/geom/1500-Punkt-Strecken) trieb
      // localStorage-Quota + Heap (35-MB-Blob) und konnte stale Cross-Tenant-Daten halten.
      // Live: loadProjects() füllt bei Boot/Mandantenwechsel; Demo: seedIfEmpty() baut bei seeded=false.
      partialize: () => ({}),
      // Defensive: korrupte Persists (projects: undefined) heilen — projects MUSS ein Array
      // bleiben, sonst crasht s.projects.find/[...projects] beim ersten Render.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProjectStore>
        return { ...current, ...p, projects: Array.isArray(p.projects) ? p.projects : current.projects }
      },
    },
  ),
)
