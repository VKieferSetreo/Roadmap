// Typed API-Client für das Roadmap-Backend (server/, Contract: .planning/SPEC-backend-v2.md).
// Alle Pfade relativ zur axios-baseURL (Dev: /api via Vite-Proxy, Prod: /roadmap/api).

import axiosClient from "./client"
import type {
  AppNotification,
  AppStats,
  BugReport,
  BugReportCreate,
  BugReportList,
  BugReportStatus,
  Finding,
  FindingKategorie,
  FindingSeverity,
  Obstacle,
  ObstacleCreate,
  Project,
  ProjectRoute,
  ShareInfo,
  SyncJob,
  SyncStatus,
  Tenant,
  TenantRole,
  TransportData,
  TransportZeitraum,
} from "@/types/domain"

export interface HealthResponse {
  ok: boolean
  db: boolean
  version: string
}

/** Nutzer-/Mandanten-Kontext (GET /api/context). */
export interface AppContext {
  email: string
  isAdmin: boolean
  /** true = Login über setreo-auth-extern (Kunden-Gateway) — eigenes Passwort änderbar,
   *  Logo führt zur Projektübersicht statt zum Hub-Admin. */
  extern?: boolean
  /** Mandant des Nutzers (Admin: aktuell gewählter via X-Tenant). null = kein Mandant zugeordnet. */
  tenant: { id: string; slug: string; name: string } | null
  /** Alle Mandanten — nur für Admins gefüllt (Tenant-Switcher). */
  tenants?: Tenant[]
}

/** Fund mit Projekt-Kontext (projektübergreifende Datenbank-Suche). */
export type DbFinding = Finding & { projektId: string; projektName: string; fachId?: string }

export interface ProjectPatch {
  name?: string
  routes?: ProjectRoute[]
  transport?: TransportData
  zeitraum?: TransportZeitraum
  /** true = archivieren, false = wiederherstellen. */
  archiviert?: boolean
}

export const api = {
  health: () => axiosClient<HealthResponse>({ url: "/health", method: "GET", timeout: 2_500 }),

  context: () => axiosClient<AppContext>({ url: "/context", method: "GET" }),

  listProjects: () =>
    axiosClient<{ projects: Project[] }>({ url: "/projects", method: "GET" }).then(
      (r) => r?.projects ?? [],
    ),

  createProject: (name: string) =>
    axiosClient<Project>({ url: "/projects", method: "POST", data: { name } }),

  patchProject: (id: string, patch: ProjectPatch) =>
    axiosClient<Project>({ url: `/projects/${id}`, method: "PATCH", data: patch }),

  deleteProject: (id: string) => axiosClient<void>({ url: `/projects/${id}`, method: "DELETE" }),

  /** Analyse synchron auf dem Server fahren — liefert das aktualisierte Projekt. */
  runAnalysis: (id: string) =>
    axiosClient<Project>({ url: `/projects/${id}/analysis`, method: "POST", timeout: 60_000 }),

  // ── Veröffentlichen (Share-Links für Externe) ──────────────────────────────
  publishProject: (id: string, password?: string) =>
    axiosClient<ShareInfo>({
      url: `/projects/${id}/share`,
      method: "POST",
      data: { password: password || undefined },
    }),

  revokeShare: (id: string) =>
    axiosClient<void>({ url: `/projects/${id}/share`, method: "DELETE" }),

  // ── Mandanten-Verwaltung (nur Setreo-Admin) ────────────────────────────────
  listTenants: () =>
    axiosClient<{ tenants: Tenant[] }>({ url: "/admin/tenants", method: "GET" }).then(
      (r) => r.tenants,
    ),

  createTenant: (slug: string, name: string) =>
    axiosClient<Tenant>({ url: "/admin/tenants", method: "POST", data: { slug, name } }),

  renameTenant: (id: string, name: string) =>
    axiosClient<Tenant>({ url: `/admin/tenants/${id}`, method: "PATCH", data: { name } }),

  deleteTenant: (id: string) =>
    axiosClient<void>({ url: `/admin/tenants/${id}`, method: "DELETE" }),

  /** Zentraler Speichern-Button: setzt die komplette Nutzerliste eines Mandanten
   *  (Rolle + Passwort je Nutzer). Neue brauchen ein Passwort (werden provisioniert),
   *  geändertes Passwort wird neu gesetzt, Entfernte fallen weg. */
  saveTenantMembers: (id: string, members: { email: string; role: TenantRole; password: string }[]) =>
    axiosClient<Tenant>({ url: `/admin/tenants/${id}/members`, method: "PUT", data: { members } }),

  /** Einzelnen Kunden-Zugang anlegen/aktualisieren (Konto in setreo-auth-extern).
   *  created=false ⇒ Konto existierte, Passwort wurde neu gesetzt. */
  createTenantUser: (id: string, email: string, password: string, role: TenantRole = "user") =>
    axiosClient<{ email: string; created: boolean; tenant: Tenant }>({
      url: `/admin/tenants/${id}/users`,
      method: "POST",
      data: { email, password, role },
    }),

  // ── Datenbank ──────────────────────────────────────────────────────────────
  searchFindings: (params: { q?: string; kategorie?: string; severity?: string }) =>
    axiosClient<{ findings: DbFinding[] }>({ url: "/findings", method: "GET", params }).then(
      (r) => r.findings,
    ),

  listObstacles: (
    params?: {
      kategorie?: FindingKategorie | string
      q?: string
      /** nur gemeldete Ereignisse (Baustellen/Sperrungen), keine Infrastruktur. */
      gemeldet?: boolean
      /** nur aktive Einträge. */
      aktiv?: boolean
      /** zusätzlich die Strecken-Geometrie (geom) laden — nur für die Karte (schwerer Blob). */
      geom?: boolean
    },
  ) =>
    axiosClient<{ obstacles: Obstacle[] }>({ url: "/obstacles", method: "GET", params }).then(
      (r) => r.obstacles,
    ),

  /** Kunden-Hindernis anlegen (tenant-eigen, Karten-Klick-Flow). */
  createObstacle: (payload: ObstacleCreate) =>
    axiosClient<Obstacle>({ url: "/obstacles", method: "POST", data: payload }),

  /** Eigenen Eintrag verwerfen/löschen (nur eigene Tenant-Einträge bzw. Admin). */
  deleteObstacle: (id: string) =>
    axiosClient<void>({ url: `/obstacles/${id}`, method: "DELETE" }),

  stats: () => axiosClient<AppStats>({ url: "/stats", method: "GET" }),

  // ── Sync ("Alle Quellen aktualisieren") ────────────────────────────────────
  sync: {
    /** Status der Quellen + zuletzt aktualisiert (DB-Tab-Kopf). */
    status: () => axiosClient<SyncStatus>({ url: "/sync/status", method: "GET" }),
    /** Sync starten (oder laufenden Job zurückbekommen). */
    start: () => axiosClient<SyncJob>({ url: "/sync", method: "POST" }),
    /** Fortschritt pollen. */
    job: (id: string) => axiosClient<SyncJob>({ url: `/sync/${id}`, method: "GET" }),
  },

  // ── Nachrichtenzentrum / Glocke ────────────────────────────────────────────
  notifications: {
    list: () =>
      axiosClient<{ notifications: AppNotification[]; unreadCount: number }>({
        url: "/notifications",
        method: "GET",
      }),
    unreadCount: () =>
      axiosClient<{ count: number }>({ url: "/notifications/unread-count", method: "GET" }).then(
        (r) => r.count,
      ),
    read: (id: string) =>
      axiosClient<{ updated: number }>({ url: `/notifications/${id}/read`, method: "POST" }),
    readAll: () =>
      axiosClient<{ updated: number }>({ url: "/notifications/read-all", method: "POST" }),
    /** Alle Nachrichten löschen (Papierkorb). */
    deleteAll: () =>
      axiosClient<{ deleted: number }>({ url: "/notifications", method: "DELETE" }),
    /** Bekommt der Nutzer E-Mail-Benachrichtigungen? (Opt-out je Mandant + Adresse) */
    mailPref: () =>
      axiosClient<{ enabled: boolean }>({ url: "/notifications/mail-pref", method: "GET" }).then(
        (r) => r.enabled,
      ),
    /** E-Mail-Benachrichtigungen ein-/ausschalten. */
    setMailPref: (enabled: boolean) =>
      axiosClient<{ enabled: boolean }>({
        url: "/notifications/mail-pref",
        method: "POST",
        data: { enabled },
      }),
  },

  // ── Bug-Reports (Melden: jeder; Liste/Triage: Admin) ───────────────────────
  bugReports: {
    /** Melden — jeder eingeloggte Nutzer. */
    create: (payload: BugReportCreate) =>
      axiosClient<BugReport>({ url: "/bug-reports", method: "POST", data: payload }),
    /** Liste + Status-Zähler (nur Admin). */
    list: (status?: BugReportStatus) =>
      axiosClient<BugReportList>({
        url: "/bug-reports",
        method: "GET",
        params: status ? { status } : undefined,
      }),
    /** Status/Notiz pflegen (nur Admin). */
    patch: (id: string, patch: { status?: BugReportStatus; notiz?: string | null }) =>
      axiosClient<BugReport>({ url: `/bug-reports/${id}`, method: "PATCH", data: patch }),
    /** Löschen (nur Admin). */
    remove: (id: string) =>
      axiosClient<void>({ url: `/bug-reports/${id}`, method: "DELETE" }),
  },

  // ── Eigenes Konto ──────────────────────────────────────────────────────────
  account: {
    /** Eigenes Passwort ändern (nur externe Kunden-Accounts). */
    changePassword: (neuesPasswort: string) =>
      axiosClient<{ ok: true }>({ url: "/account/password", method: "POST", data: { neuesPasswort } }),
  },
}

export type { FindingSeverity }
