// Projekt-Store (zustand + persist) mit zwei Datenquellen:
//  - "live": Backend/Postgres — optimistische Updates + debounced PATCH-Sync,
//    Analyse läuft serverseitig (Engine gegen die Hindernis-Datenbank), Tenant-gescoped.
//  - "demo": lokaler Mock (Frontend-only-Fallback, z.B. Dev ohne Server).
// `analysis` (laufender Fortschritt) wird NICHT persistiert.

import { useEffect } from "react"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { Finding, HideReason, MarkierungsEbene, Project, ProjectRoute, TransportData, TransportZeitraum } from "@/types/domain"
import { DEFAULT_TRANSPORT, MARKIERUNG_FARBEN, markierungenUnvollstaendig, ROUTE_FARBEN } from "@/types/domain"
import { runMockAnalysis } from "@/lib/mock/generate"
import { buildSeedProjects } from "@/lib/mock/seed"
import { api, type ProjectPatch } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import { isLive } from "./datasource"
import { useFolderStore } from "./folders"
import { useContextStore } from "./context"

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

interface AnalysisState {
  running: boolean
  progress: number
  step: string
  /** gesetzt, wenn der letzte Lauf fehlschlug — die Anlage zeigt dann das Fehler-Icon. */
  error?: string
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
  /** T-744: Projekte, deren Markierungs-Punkte nicht nachgeladen werden konnten. Ohne dieses Flag
   *  bliebe der Markierungs-Block dauerhaft auf „wird geladen" stehen — ohne Ausweg außer Reload. */
  markierungenLadefehler: Record<string, true>
  seeded: boolean
  loadError: boolean // T-228: letzter loadProjects ist mit Fehler gescheitert (≠ legitim leer)
  /** true während der initiale Live-Load läuft (Skeletons). */
  loading: boolean
  /** Vorab vom Server geholte Anzahl aktiver Projekte → so viele Lade-Platzhalter (Home-Karten)
   *  rendern, bevor die volle Liste (mit Funden/Geometrie) da ist. 0 = noch unbekannt. */
  placeholderCount: number
  /** Anzahl Top-Level-Einträge im Sidebar-Baum (Wurzelordner + Wurzelprojekte) → so viele
   *  Lade-Dummies in der Sidebar. 0 = noch unbekannt. */
  topLevelCount: number

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
  /** Projekt einem Ordner zuordnen (T-177); folderId=null → Wurzel. opts.private (058): bei
   *  Wurzel-Drop die Zielzone (true = privat, false = geteilt); in einen Ordner wird sie geerbt. */
  setProjectFolder: (id: string, folderId: string | null, opts?: { private?: boolean }) => void

  /** Strecke hinzufügen (Farbe wird automatisch aus der Palette vergeben). */
  addRoute: (id: string, route: Omit<ProjectRoute, "id" | "farbe">) => void
  removeRoute: (id: string, routeId: string) => void
  renameRoute: (id: string, routeId: string, name: string) => void
  /** Strecke editieren (Name und/oder Geometrie + exakte Wegpunkte) — Strecken-Editor. */
  /** `oeffentlich` gehoert dazu (T-650): die Freigabe je Strecke laeuft ueber denselben Weg
   *  wie Umbenennen und Ziehen, inklusive optimistischem Update und Sync. */
  updateRoute: (id: string, routeId: string, patch: Partial<Pick<ProjectRoute, "name" | "points" | "waypoints" | "oeffentlich">>) => void
  /** Markierungs-Ebenen (T-739). Mehrere auf einmal, weil eine Datei mehrere Layer liefert und
   *  die Farbvergabe sonst gegen einen veralteten Stand liefe. */
  /** Holt EIN Projekt vollständig nach (T-739): die Liste liefert Markierungs-Ebenen ohne ihre
   *  Punkte. Ohne diesen Nachlauf bliebe die Karte leer und ein Speichern würde die Punkte löschen. */
  loadProjectDetail: (id: string) => Promise<void>
  /** Alle drei geben false zurück und ändern NICHTS, solange die Punkte nur als Listen-Fassung da
   *  sind (T-744). Die Sperre sitzt hier und nicht nur im Rendern: loadProjects kann den Stand
   *  jederzeit zurück in die Listenform kippen, während ein Dialog, ein Datei-Parse oder ein
   *  Umbenennen-Formular noch offen ist — deren Callbacks kämen sonst durch, der Sync ließe das Feld
   *  weg, und die Änderung wäre still verloren. Bei der Freigabe hieße das: die Oberfläche zeigt
   *  „ausgeblendet", der Kunde sieht die Ebene weiter. */
  addMarkierungsEbenen: (id: string, ebenen: Array<Omit<MarkierungsEbene, "id" | "farbe">>) => boolean
  removeMarkierungsEbene: (id: string, ebeneId: string) => boolean
  updateMarkierungsEbene: (id: string, ebeneId: string, patch: Partial<Pick<MarkierungsEbene, "name" | "oeffentlich">>) => boolean

  updateTransport: (id: string, patch: Partial<TransportData>) => void
  updateZeitraum: (id: string, patch: Partial<TransportZeitraum>) => void
  runAnalysis: (id: string) => void
  /** Den gemerkten Fehler eines Laufs vergessen (T-731). Nötig für den Kollisionsfall: dort hilft
   *  kein zweiter Start, sondern nur neu laden — und ohne diese Aktion bliebe die Meldung
   *  „Auswertung läuft bereits" stehen, auch wenn der fremde Lauf längst fertig ist. */
  clearAnalysisError: (id: string) => void

  /** Veröffentlichen / Share-Link verwalten (nur live). */
  publishProject: (id: string, password?: string) => Promise<void>
  revokeShare: (id: string) => Promise<void>
  hideFinding: (projectId: string, finding: Finding, grund: HideReason, grundText?: string) => void
  unhideFinding: (projectId: string, finding: Finding) => void
}

// Laufende Intervalle + Sync-Debounces außerhalb des States (nicht serialisierbar).
const timers: Record<string, ReturnType<typeof setInterval>> = {}
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
// #21: Auto-Analyse-Debounce je Projekt — eine Strecke laden (auch ein GPKG-Batch mit N Strecken)
// stößt EINE Auswertung an, nicht N.
const autoTimers: Record<string, ReturnType<typeof setTimeout>> = {}

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
/** Die Felder, die ein Sync vom lokalen Projekt an den Server schickt — EINE Liste für scheduleSync
 *  und den Sofort-Flush vor der Auswertung. T-744: der Flush führte seine eigene Kopie, ohne
 *  markierungen; eine Ebenen-Änderung, die noch im 600-ms-Fenster hing, ging beim Start der
 *  Auswertung verloren und wurde von der Analyse-Antwort überschrieben.
 *
 *  markierungen NUR, wenn die Punkte wirklich geladen sind (T-739): die Projektliste liefert die
 *  Ebenen ohne Punktlast (punkte: [], anzahl: n) — ein PATCH mit diesem Stand würde ALLE Markierungen
 *  löschen. Feld weglassen heißt serverseitig „unverändert lassen". */
function syncFelder(p: Project): ProjectPatch {
  return {
    name: p.name,
    routes: p.routes,
    ...(markierungenUnvollstaendig(p) ? {} : { markierungen: p.markierungen ?? [] }),
    transport: p.transport,
    zeitraum: p.zeitraum,
  }
}

function applyPatch(id: string, patch: ProjectPatch, get: () => ProjectStore, set: SetState): Promise<void> {
  const known = get().getProject(id)?.version
  return api
    .patchProject(id, { ...patch, version: known })
    .then((updated) => adoptVersion(set, id, updated.version))
    .catch((e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Das Projekt wurde zwischenzeitlich von jemand anderem geändert. Es wird neu geladen.")
        void get().loadProjects()
      } else if (e instanceof ApiError && e.status === 413) {
        // T-744: Vorher landete das als „Verbindung prüfen" — und der zu große Stand blieb im Store,
        // so dass JEDER weitere Sync des Projekts (auch Name oder Transport) wieder mit 413 scheiterte.
        // Die Meldung des Servers sagt, was zu tun ist; der Neuladen verwirft den zu großen Stand.
        toast.error(`${e.message} Die letzte Änderung wurde nicht gespeichert, das Projekt wird neu geladen.`)
        void get().loadProjects()
      } else if (e instanceof ApiError && e.status > 0) {
        // T-744 (Review): Der Server hat geantwortet und abgelehnt (4xx/5xx) — die Änderung ist NICHT
        // gespeichert, der Store zeigt sie aber weiter. Bei der Freigabe hieße das: Haken
        // „ausgeblendet", der Kunde sieht die Ebene weiter. Also den echten Stand holen.
        toast.error("Die Änderung wurde vom Server nicht angenommen und ist nicht gespeichert. Das Projekt wird neu geladen.")
        void get().loadProjects()
      } else {
        // Keine Antwort (Netz, Timeout): ein Neuladen scheiterte ebenso. Der Hinweis sagt ehrlich,
        // dass nichts gespeichert wurde.
        toast.error("Änderung konnte nicht gespeichert werden. Verbindung prüfen.")
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
    void applyPatch(id, syncFelder(p), get, set)
  }, 600)
}

/** true = Punkte nur als Listen-Fassung da, keine Änderung zulassen (siehe addMarkierungsEbenen). */
function markierungenGesperrt(get: () => ProjectStore, id: string): boolean {
  const p = get().getProject(id)
  if (!p || !markierungenUnvollstaendig(p)) return false
  toast.error("Die Markierungen dieses Projekts werden gerade geladen. Bitte versuchen Sie es gleich noch einmal.")
  return true
}

/** Nächste freie Markierungs-Farbe (Palette der Reihe nach, Lücken zuerst). */
function naechsteMarkierungsFarbe(ebenen: MarkierungsEbene[]): string {
  const used = new Set(ebenen.map((e) => e.farbe))
  return MARKIERUNG_FARBEN.find((f) => !used.has(f)) ?? MARKIERUNG_FARBEN[ebenen.length % MARKIERUNG_FARBEN.length]
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
        toast.warning("Lokaler Speicher voll. Ihre Daten bleiben für diese Sitzung erhalten.")
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
      markierungenLadefehler: {},
      seeded: false,
      loading: false,
      loadError: false,
      placeholderCount: 0,
      topLevelCount: 0,

      initData: async (mode) => {
        if (mode === "demo") {
          get().seedIfEmpty()
          return
        }
        await get().loadProjects()
      },

      loadProjects: async () => {
        set({ loading: true, loadError: false })
        // Vorab nur die Anzahl holen (winziger, schneller Call) → das FE zeigt sofort die richtige
        // Zahl Lade-Platzhalter; die echten Karten kommen mit der vollen Liste auf einen Schlag.
        void api
          .projectCount()
          .then((c) => { if (get().loading) set({ placeholderCount: c.aktiv, topLevelCount: c.topLevel }) })
          .catch(() => {})
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
            toast.error("Projekt konnte nicht angelegt werden. Bitte erneut versuchen.")
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
        // T-235: Snapshot vor der optimistischen Änderung → bei Fehler zurückrollen (war fire-and-forget).
        const prevArchiviertAm = get().getProject(id)?.archiviertAm ?? null
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
              set((s) => ({
                projects: s.projects.map((p) => (p.id === id ? { ...p, archiviertAm: prevArchiviertAm } : p)),
              }))
            })
        }
      },

      setProjectFolder: (id, folderId, opts) => {
        const cur = get().getProject(id)
        const prevFolder = cur?.folderId ?? null
        const prevOwner = cur?.owner ?? null
        // Optimistische Zone: in einen Ordner → dessen owner erben; auf Wurzel → private-Flag.
        const targetOwner =
          folderId != null
            ? (useFolderStore.getState().folders.find((f) => f.id === folderId)?.owner ?? null)
            : opts?.private
              ? (useContextStore.getState().email || prevOwner || "privat")
              : null
        if (prevFolder === folderId && prevOwner === targetOwner) return
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, folderId, owner: targetOwner } : p)),
        }))
        if (isLive()) {
          api
            .patchProject(id, { folderId, ...(opts?.private !== undefined ? { private: opts.private } : {}) })
            .then((updated) => {
              adoptVersion(set, id, updated.version) // T-501: Version mitführen
              set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, owner: updated.owner ?? null } : p)) }))
            })
            .catch(() => {
              toast.error("Verschieben konnte nicht gespeichert werden.")
              set((s) => ({
                projects: s.projects.map((p) => (p.id === id ? { ...p, folderId: prevFolder, owner: prevOwner } : p)),
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
        if (autoTimers[id]) {
          clearTimeout(autoTimers[id])
          delete autoTimers[id]
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
        // #21 (Max 2026-06-21): Strecke in ein Projekt geladen → Auswertung DIREKT mitlaufen lassen
        // (bislang nur manuell, deshalb fehlten Funde der neuen Strecke). Debounced, damit ein
        // GPKG-Mehrfach-Upload zu EINEM Lauf zusammenfällt; läuft schon eine, nicht erneut starten.
        if (isLive()) {
          if (autoTimers[id]) clearTimeout(autoTimers[id])
          autoTimers[id] = setTimeout(() => {
            delete autoTimers[id]
            const p = get().getProject(id)
            // T-593: ungeprüfte VEMAGS-Strecken NICHT auto-auswerten (sie sind serverseitig vom
            // Lauf ausgeschlossen → ein Lauf nur mit ihnen schlägt fehl). Erst triggern, wenn es
            // mindestens eine analysierbare (freigegebene/andere Quelle) Strecke gibt — die
            // Auswertung nach Freigabe läuft separat aus der Prüfen-Maske.
            const analysierbar = (r: ProjectRoute) =>
              r.points.length >= 2 && !(r.source === "vemags" && r.verifiziert !== true)
            if (p && p.routes.some(analysierbar) && !get().analysis[id]?.running) {
              toast.info("Strecke geladen. Auswertung läuft …")
              get().runAnalysis(id)
            }
          }, 900)
        }
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

      loadProjectDetail: async (id) => {
        const p = get().getProject(id)
        if (!isLive() || !p || !markierungenUnvollstaendig(p)) return
        if (get().markierungenLadefehler[id]) {
          const rest = { ...get().markierungenLadefehler }
          delete rest[id]
          set({ markierungenLadefehler: rest })
        }
        try {
          const voll = await api.getProject(id)
          set((s) => ({
            projects: s.projects.map((x) =>
              // Nur die Markierungen übernehmen: alles andere kann lokal frischer sein als der
              // Server (offene optimistische Änderung, die noch im Sync-Debounce hängt).
              x.id === id ? { ...x, markierungen: voll.markierungen ?? [] } : x,
            ),
          }))
        } catch {
          // Kein Toast: Strecken und Funde stehen bereits, ein Banner für Zusatzpunkte wäre lauter als
          // der Verlust. Aber merken — der Markierungs-Block zeigt dann „Erneut versuchen" statt
          // endlos „wird geladen". Die Sperre selbst bleibt: auf einem unvollständigen Stand darf
          // nichts geändert werden, sonst ginge die Änderung beim Speichern still verloren.
          set((s) => ({ markierungenLadefehler: { ...s.markierungenLadefehler, [id]: true } }))
        }
      },

      addMarkierungsEbenen: (id, ebenen) => {
        if (!ebenen.length) return false
        if (markierungenGesperrt(get, id)) return false
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p
            const neu = [...(p.markierungen ?? [])]
            // Farbe je Ebene gegen den WACHSENDEN Stand vergeben, sonst bekämen alle Ebenen
            // einer Datei dieselbe Farbe.
            for (const e of ebenen) neu.push({ ...e, id: uid(), farbe: naechsteMarkierungsFarbe(neu) })
            return { ...p, markierungen: neu, updatedAt: now() }
          }),
        }))
        scheduleSync(id, get, set)
        // Bewusst KEIN runAnalysis: Markierungen sind rein visuell und ändern an der
        // Hindernis-Auswertung nichts (anders als addRoute).
        return true
      },

      removeMarkierungsEbene: (id, ebeneId) => {
        if (markierungenGesperrt(get, id)) return false
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, markierungen: (p.markierungen ?? []).filter((e) => e.id !== ebeneId), updatedAt: now() }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
        return true
      },

      updateMarkierungsEbene: (id, ebeneId, patch) => {
        if (markierungenGesperrt(get, id)) return false
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  markierungen: (p.markierungen ?? []).map((e) => (e.id === ebeneId ? { ...e, ...patch } : e)),
                  updatedAt: now(),
                }
              : p,
          ),
        }))
        scheduleSync(id, get, set)
        return true
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

      // T-731: siehe Typdeklaration. Nur den Fehler löschen, nicht den ganzen Eintrag — läuft
      // gerade ein Lauf, bliebe sonst der Fortschritt auf der Strecke.
      clearAnalysisError: (id) =>
        set((s) => {
          const cur = s.analysis[id]
          if (!cur?.error) return s
          const rest = { ...cur }
          delete rest.error
          return { analysis: { ...s.analysis, [id]: rest } }
        }),

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
          set((s) => ({
            // Eintrag behalten (running:false) MIT Fehler-Marker → die Anlage zeigt das rote Kreuz.
            // Ein neuer Lauf ersetzt den Eintrag und löscht damit den Fehler.
            analysis: { ...s.analysis, [id]: { running: false, progress: 0, step: "Fehlgeschlagen", error: message } },
            projects: s.projects.map((p) =>
              p.id === id ? { ...p, status: p.findings.length > 0 ? "fertig" : "entwurf" } : p,
            ),
          }))
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
          const felder = p ? syncFelder(p) : undefined
          // T-744 (Review): markierungen NUR, wenn wirklich ein Sync ausstand. Ohne diese Bedingung
          // schrieb JEDER Auswertungsstart die Markierungen blind (ohne version) zurück: ein veralteter
          // Tab überschrieb dann still die Ebenen eines Kollegen oder blendete eine gerade für den Kunden
          // ausgeblendete Ebene wieder ein — ohne 409, ohne Hinweis. Vor T-744 enthielt der Flush gar
          // keine Markierungen. Die Engine braucht sie nicht, sie sind rein visuell.
          // ponytail: Restfenster bleibt — steht in genau diesem Moment ein Sync aus UND hat ein anderer
          // Tab die Freigabe geändert, gewinnt dieser Tab. Dieselbe Lücke haben Strecken seit T-650;
          // richtig wäre ein Flush MIT version und getrennter 409-Behandlung (Ticket T-745).
          if (felder && !pending) delete felder.markierungen
          const sync = felder
            ? api.patchProject(id, felder).then((u) => adoptVersion(set, id, u.version))
            : Promise.resolve()

          sync
            .then(() => api.runAnalysis(id))
            .then((updated) => finish(() => updated))
            .catch((e) =>
              // T-467: 409 = für dieses Projekt läuft bereits eine Auswertung (Doppelklick /
              // zweiter Disponent / Kollision mit Nacht-Rerun) → klare Meldung statt „Server-Fehler".
              fail(
                e instanceof ApiError && e.status === 409
                  ? "Für dieses Projekt läuft bereits eine Auswertung. Bitte kurz warten."
                  : "Analyse fehlgeschlagen. Server nicht erreichbar oder Fehler in der Engine.",
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

/** Holt die Markierungs-Punkte eines Projekts nach, sobald es nur als Listen-Fassung im Store steht
 *  (T-739). Die Projektliste liefert Ebenen ohne Punkte, sonst trüge jede Listen-Antwort die gesamte
 *  Punktlast aller Projekte.
 *
 *  T-744: Der Effekt hängt am ZUSTAND „Punkte fehlen", nicht nur an der Projekt-ID. Die erste Fassung
 *  lief mit [id] und feuerte bei einem Reload oder Direktlink, BEVOR die Projektliste da war: das
 *  Projekt fehlte im Store, der Aufruf kehrte sofort zurück, und weil sich die ID danach nicht mehr
 *  änderte, lief er nie wieder. Gemessen gegen ein echtes Backend: kein einziges
 *  GET /api/projects/<id> nach dem Reload, Punkte dauerhaft unsichtbar, Block dauerhaft gesperrt.
 *  Im Demo-Modus war das unsichtbar, dort gibt es keine beschnittene Liste. */
export function useMarkierungenNachladen(id: string | undefined) {
  const loadProjectDetail = useProjectStore((s) => s.loadProjectDetail)
  const fehlen = useProjectStore((s) => {
    const p = id ? (s.projects ?? []).find((x) => x.id === id) : undefined
    return p ? markierungenUnvollstaendig(p) : false
  })
  useEffect(() => {
    if (id && fehlen) void loadProjectDetail(id)
  }, [id, fehlen, loadProjectDetail])
}
