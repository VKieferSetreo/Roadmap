// Typed API-Client für das Roadmap-Backend (server/, Contract: .planning/SPEC-backend-v1.md).
// Alle Pfade relativ zur axios-baseURL (Dev: /api via Vite-Proxy, Prod: /roadmap/api).

import axiosClient from "./client"
import type {
  AppStats,
  Finding,
  FindingKategorie,
  FindingSeverity,
  Obstacle,
  Project,
  RouteInput,
  TransportData,
  TransportZeitraum,
} from "@/types/domain"

export interface HealthResponse {
  ok: boolean
  db: boolean
  version: string
}

/** Fund mit Projekt-Kontext (projektübergreifende Datenbank-Suche). */
export type DbFinding = Finding & { projektId: string; projektName: string }

export interface ProjectPatch {
  name?: string
  route?: RouteInput
  transport?: TransportData
  zeitraum?: TransportZeitraum
}

export const api = {
  health: () => axiosClient<HealthResponse>({ url: "/health", method: "GET", timeout: 2_500 }),

  listProjects: () =>
    axiosClient<{ projects: Project[] }>({ url: "/projects", method: "GET" }).then(
      (r) => r.projects,
    ),

  createProject: (name: string) =>
    axiosClient<Project>({ url: "/projects", method: "POST", data: { name } }),

  patchProject: (id: string, patch: ProjectPatch) =>
    axiosClient<Project>({ url: `/projects/${id}`, method: "PATCH", data: patch }),

  deleteProject: (id: string) => axiosClient<void>({ url: `/projects/${id}`, method: "DELETE" }),

  /** Analyse synchron auf dem Server fahren — liefert das aktualisierte Projekt. */
  runAnalysis: (id: string) =>
    axiosClient<Project>({
      url: `/projects/${id}/analysis`,
      method: "POST",
      // Geocoding + Routing können ein paar Sekunden brauchen
      timeout: 60_000,
    }),

  searchFindings: (params: { q?: string; kategorie?: string; severity?: string }) =>
    axiosClient<{ findings: DbFinding[] }>({ url: "/findings", method: "GET", params }).then(
      (r) => r.findings,
    ),

  listObstacles: (params?: { kategorie?: FindingKategorie | string; q?: string }) =>
    axiosClient<{ obstacles: Obstacle[] }>({ url: "/obstacles", method: "GET", params }).then(
      (r) => r.obstacles,
    ),

  stats: () => axiosClient<AppStats>({ url: "/stats", method: "GET" }),
}

export type { FindingSeverity }
