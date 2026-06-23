// Typed API-Client für das Roadmap-Backend (server/, Contract: .planning/SPEC-backend-v2.md).
// Alle Pfade relativ zur axios-baseURL (Dev: /api via Vite-Proxy, Prod: /roadmap/api).

import axiosClient from "./client"
import type {
  AccountLicense,
  AppNotification,
  AppStats,
  BugReport,
  BugReportCreate,
  BugReportList,
  BugReportStatus,
  Finding,
  FindingChatMessage,
  FindingKategorie,
  FindingSeverity,
  Folder,
  HideReason,
  HiddenFindingsResponse,
  MailPref,
  News,
  NewsKategorie,
  Obstacle,
  ObstacleCreate,
  Project,
  ProjectRoute,
  RoutePoint,
  SeatCode,
  ShareInfo,
  SourceRequest,
  SourceRequestCreate,
  SourceRequestList,
  SyncJob,
  SyncStatus,
  Tenant,
  TenantLicense,
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
  /** true = Mandanten-eigener Admin (tenant_members.role='admin') — darf eigene Nutzer/Seats verwalten (T-147). */
  isTenantAdmin?: boolean
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
  /** Ordner-Zuordnung (T-177): Ordner-ID oder null (zurück auf Wurzelebene). */
  folderId?: string | null
  /** Optimistic-Lock (T-466): bekannte Version; Server lehnt mit 409 ab, wenn veraltet. */
  version?: number
}

/** Ergebnis einer Routen-Berechnung (Start/Ziel oder Google-Maps-Link). */
export interface RouteResult {
  points: RoutePoint[]
  distanzKm: number
  dauerMin: number | null
  provider: { geocoder?: string; router: string; fallback: boolean }
  stops?: number
  resolvedUrl?: string
}

/** Ergebnis eines VEMAGS-Bescheid-Uploads (POST /api/route/vemags). */
export interface VemagsResult {
  meta: { bescheidVersion: string | null; antragsteller: string | null; behoerde: string | null }
  /** Transport-Maße aus dem Bescheid (Felder null, wenn nicht extrahierbar). */
  spec: {
    laengeM: number | null
    breiteM: number | null
    hoeheM: number | null
    masseT: number | null
    achslastenT: number[]
  }
  /** Eine Strecke je Fahrtwegteil (Leer-/Lastfahrt). */
  strecken: {
    name: string
    art: string
    istLastfahrt: boolean
    points: RoutePoint[]
    distanzKm: number
    grob?: boolean
    wegpunkte?: number
    ungeloest?: string[]
    fehler?: string
  }[]
}

/** Plattform-Analytics-Übersicht (GET /api/analytics/overview, nur Admin). */
export interface AnalyticsOverview {
  onlineJetzt: number
  online: { email: string; lastSeen: string }[]
  totals: { sessions: number; nutzer: number; manuelleAuswertungen: number; aktivMinGesamt: number }
  proNutzer: {
    email: string
    sessions: number
    hits: number
    aktivMin: number
    manuelleAuswertungen: number
    ersterBesuch: string
    letzterBesuch: string
  }[]
  proTag: { tag: string; nutzer: number; sessions: number; auswertungen: number }[]
  letzteSessions: {
    email: string
    tenantSlug: string | null
    startedAt: string
    lastSeen: string
    hits: number
    dauerMin: number
  }[]
}

/** Datenabdeckung (GET /api/abdeckung, ungated) — EINE Quelle für In-App-Board + öffentliche Seite. */
export interface AbdeckungResponse {
  kats: string[]
  data: Record<string, [number, number, string][]>
  stand: string
  connectoren: number
  hinweis: string
}

export const api = {
  health: () => axiosClient<HealthResponse>({ url: "/health", method: "GET", timeout: 2_500 }),

  context: () => axiosClient<AppContext>({ url: "/context", method: "GET" }),

  abdeckung: () => axiosClient<AbdeckungResponse>({ url: "/abdeckung", method: "GET" }),

  // #16: Orts-/Adress-Suche server-seitig (Nominatim-Proxy) — der direkte Browser-Fetch ist
  // seit der CSP (connect-src 'self') geblockt.
  geocodeSearch: (q: string) =>
    axiosClient<{
      results: {
        place_id: number
        display_name: string
        lat: string
        lon: string
        boundingbox?: [string, string, string, string]
      }[]
    }>({
      url: "/geocode/search",
      method: "GET",
      params: { q },
    }),

  listProjects: () =>
    axiosClient<{ projects: Project[] }>({ url: "/projects", method: "GET" }).then(
      (r) => r?.projects ?? [],
    ),

  /** Nur die Projekt-Anzahl (winziger, schneller Vorab-Call) → das FE zeigt sofort die richtige
   *  Zahl Lade-Platzhalter, bevor die volle Liste (mit Funden/Geometrie) geladen ist. */
  projectCount: () =>
    axiosClient<{ aktiv: number; archiviert: number }>({ url: "/projects/count", method: "GET", timeout: 6_000 }),

  createProject: (name: string) =>
    axiosClient<Project>({ url: "/projects", method: "POST", data: { name } }),

  patchProject: (id: string, patch: ProjectPatch) =>
    axiosClient<Project>({ url: `/projects/${id}`, method: "PATCH", data: patch }),

  deleteProject: (id: string) => axiosClient<void>({ url: `/projects/${id}`, method: "DELETE" }),

  /** Analyse synchron auf dem Server fahren — liefert das aktualisierte Projekt.
   *  Timeout großzügig (150s): lange Mehr-Strecken-Projekte (z.B. VEMAGS, 3 Fahrtwegteile à ~870 km
   *  = 6000 Punkte) brauchen ~70s; mit 60s brach das FE ab und zeigte fälschlich „keine Auswertung",
   *  obwohl der Server fertig wurde. (Proxy-Decke ~100s — sehr große Bescheide bräuchten Async.) */
  runAnalysis: (id: string) =>
    axiosClient<Project>({ url: `/projects/${id}/analysis`, method: "POST", timeout: 150_000 }),

  // ── Veröffentlichen (Share-Links für Externe) ──────────────────────────────
  publishProject: (id: string, password?: string) =>
    axiosClient<ShareInfo>({
      url: `/projects/${id}/share`,
      method: "POST",
      data: { password: password || undefined },
    }),

  revokeShare: (id: string) =>
    axiosClient<void>({ url: `/projects/${id}/share`, method: "DELETE" }),

  // ── Funde ausblenden (pro Projekt, nachhaltig) ─────────────────────────────
  hideFinding: (
    projectId: string,
    body: {
      findingKey: string
      obstacleId?: string | null
      grund: HideReason
      grundText?: string
      kontext?: Record<string, unknown>
    },
  ) =>
    axiosClient<{ ok: true }>({
      url: `/projects/${projectId}/findings/hide`,
      method: "POST",
      data: body,
    }),
  unhideFinding: (projectId: string, findingKey: string) =>
    axiosClient<{ ok: true }>({
      url: `/projects/${projectId}/findings/unhide`,
      method: "POST",
      data: { findingKey },
    }),
  hiddenFindings: () =>
    axiosClient<HiddenFindingsResponse>({ url: "/admin/hidden-findings", method: "GET" }),

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

  /** DSGVO Art.15/20: Voll-Export der Mandanten-Daten als JSON. */
  exportTenant: (id: string) =>
    axiosClient<unknown>({ url: `/admin/tenants/${id}/export`, method: "GET", timeout: 60_000 }),

  /** DSGVO Art.17: Mandant anonymisieren (PII raus, Struktur/Statistik anonym erhalten). Irreversibel. */
  anonymizeTenant: (id: string) =>
    axiosClient<{ ok: boolean; anonymizedMembers: number }>({ url: `/admin/tenants/${id}/anonymize`, method: "POST" }),

  /** T-346: Mandant aussetzen/reaktivieren. */
  suspendTenant: (id: string, suspended: boolean) =>
    axiosClient<{ id: string; slug: string; name: string; suspended_at: string | null }>({
      url: `/admin/tenants/${id}/suspended`, method: "PATCH", data: { suspended },
    }),

  /** Einzelner Mandant inkl. Mitglieder — Lade-Endpoint der Tenant-Admin-Self-Service-Seite (T-147). */
  getTenant: (id: string) =>
    axiosClient<Tenant>({ url: `/admin/tenants/${id}`, method: "GET" }),

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

  // ── Lizenz & Seat-Codes (nur Setreo-Admin) ─────────────────────────────────
  /** Lizenz eines Mandanten setzen: Plan, Seats (Anzahl Codes), Laufzeit. */
  setTenantLicense: (id: string, license: TenantLicense) =>
    axiosClient<{ plan: string; max_seats: number; valid_until: string | null }>({
      url: `/admin/tenants/${id}/license`,
      method: "PATCH",
      data: { plan: license.plan, maxSeats: license.maxSeats, validUntil: license.validUntil },
    }),

  /** Lizenz + Seat-Codes eines Mandanten lesen. */
  seatCodes: (id: string) =>
    axiosClient<{ license: TenantLicense; codes: SeatCode[] }>({
      url: `/admin/tenants/${id}/seat-codes`,
      method: "GET",
    }),

  /** Seat-Codes generieren — füllt auf max_seats auf (oder `count` zusätzliche). */
  generateSeatCodes: (id: string, count?: number) =>
    axiosClient<{ codes: SeatCode[] }>({
      url: `/admin/tenants/${id}/seat-codes`,
      method: "POST",
      data: count != null ? { count } : {},
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
    /** Eine Quelle live anpingen (Test-Fetch, kein DB-Write) — nur intern. */
    ping: (quelleId: string) =>
      axiosClient<{ ok: boolean; anzahl?: number; ms: number; error?: string }>({
        url: `/sync/ping/${quelleId}`,
        method: "POST",
        timeout: 30_000,
      }),
  },

  // ── Plattform-Analytics — Heartbeat (jeder Nutzer) + Übersicht (nur Admin) ───
  analytics: {
    /** Lebenszeichen — verlängert/öffnet die Session des Nutzers (Online-Zeit-Messung). */
    heartbeat: () => axiosClient<void>({ url: "/analytics/heartbeat", method: "PUT" }),
    /** Nutzungs-Übersicht (Admin). */
    overview: () => axiosClient<AnalyticsOverview>({ url: "/analytics/overview", method: "GET" }),
  },

  // ── Routen-Berechnung (Start/Ziel + Google-Maps-Link → optimaler Straßenweg) ──
  route: {
    /** Start + Ziel (+ optionale Zwischenstopps) → Strecke (Wegpunkt-Geometrie). */
    startziel: (start: string, ziel: string, vias?: string[]) =>
      axiosClient<RouteResult>({
        url: "/route/startziel",
        method: "POST",
        data: { start, ziel, vias },
      }),
    /** Google-Maps-Link → Wegpunkte → Strecke. */
    maps: (url: string) =>
      axiosClient<RouteResult>({ url: "/route/maps", method: "POST", data: { url } }),
    /** Wegpunkt-Koordinaten → gesnappte Strecke (Strecken-Editor, Live-Routing beim Ziehen). */
    waypoints: (points: RoutePoint[]) =>
      axiosClient<RouteResult>({ url: "/route/waypoints", method: "POST", data: { points } }),
    /** VEMAGS-Bescheid (PDF, base64) → Fahrtweg-Strecken + Transport-Maße. PDF wird serverseitig
     *  nur in-memory geparst und sofort verworfen (nie gespeichert). */
    vemags: (pdfBase64: string) =>
      axiosClient<VemagsResult>({ url: "/route/vemags", method: "POST", data: { pdfBase64 }, timeout: 60_000 }),
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
    /** E-Mail-Präferenz des Nutzers (an/aus, Scope eigene|alle, Schweregrade). */
    mailPref: () => axiosClient<MailPref>({ url: "/notifications/mail-pref", method: "GET" }),
    /** E-Mail-Präferenz setzen. */
    setMailPref: (pref: MailPref) =>
      axiosClient<MailPref>({ url: "/notifications/mail-pref", method: "POST", data: pref }),
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
    /** T-373: Screenshot eines Reports lazy nachladen (nur Admin). */
    screenshot: (id: string) =>
      axiosClient<{ screenshot: string | null }>({ url: `/bug-reports/${id}/screenshot`, method: "GET" }),
  },

  // ── Quellen-Vorschläge ───────────────────────────────────────────────────────
  sourceRequests: {
    /** Quelle vorschlagen — jeder eingeloggte Nutzer. */
    create: (payload: SourceRequestCreate) =>
      axiosClient<SourceRequest>({ url: "/source-requests", method: "POST", data: payload }),
    /** Liste + Status-Zähler (nur Admin). */
    list: (status?: BugReportStatus) =>
      axiosClient<SourceRequestList>({
        url: "/source-requests",
        method: "GET",
        params: status ? { status } : undefined,
      }),
    /** Status/Notiz pflegen (nur Admin). */
    patch: (id: string, patch: { status?: BugReportStatus; notiz?: string | null }) =>
      axiosClient<SourceRequest>({ url: `/source-requests/${id}`, method: "PATCH", data: patch }),
    /** Löschen (nur Admin). */
    remove: (id: string) =>
      axiosClient<void>({ url: `/source-requests/${id}`, method: "DELETE" }),
  },

  // ── Projekt-Ordner (T-177, tenant-geteilt) ─────────────────────────────────
  folders: {
    list: () =>
      axiosClient<{ folders: Folder[] }>({ url: "/folders", method: "GET" }).then((r) => r.folders),
    create: (name: string, parentId?: string | null) =>
      axiosClient<Folder>({ url: "/folders", method: "POST", data: { name, parentId: parentId ?? null } }),
    rename: (id: string, name: string) =>
      axiosClient<Folder>({ url: `/folders/${id}`, method: "PATCH", data: { name } }),
    /** Ordner verschieben: parentId = anderer Ordner oder null (Wurzel). */
    move: (id: string, parentId: string | null) =>
      axiosClient<Folder>({ url: `/folders/${id}`, method: "PATCH", data: { parentId } }),
    remove: (id: string) => axiosClient<void>({ url: `/folders/${id}`, method: "DELETE" }),
  },

  // ── Baustellen-Chat pro Fund (public = DB-weit, internal = nur eigener Mandant) ─
  findingChat: {
    /** Nachrichten eines Funds in einem Scope (created_at ASC). */
    list: (findingKey: string, scope: "public" | "internal") =>
      axiosClient<{ messages: FindingChatMessage[] }>({
        url: "/finding-chat",
        method: "GET",
        params: { findingKey, scope },
      }).then((r) => r.messages ?? []),
    /** Nachricht posten — Autor wird serverseitig aus dem Kontext gesetzt.
     *  payload: { body? } für kind='text' bzw. { kind:'contact', contact, body? } für eine
     *  Kontaktdaten-Karte. created_at + content_hash kommen serverseitig (append-only). */
    post: (
      findingKey: string,
      scope: "public" | "internal",
      payload: {
        body?: string
        kind?: "text" | "contact"
        contact?: { name?: string; email?: string; phone?: string }
      },
    ) =>
      axiosClient<FindingChatMessage>({
        url: "/finding-chat",
        method: "POST",
        data: { findingKey, scope, ...payload },
      }),
    /** Vorhandene Nachrichten je Scope + neuester Zeitstempel (für Badge/Unread am Fund). */
    presence: (findingKey: string) =>
      axiosClient<{ public: number; internal: number; latest: string | null }>({
        url: "/finding-chat/presence",
        method: "GET",
        params: { findingKey },
      }),
  },

  // ── News-Feed (Liste: jeder; Anlegen/Löschen: Admin) ───────────────────────
  news: {
    list: () => axiosClient<{ news: News[] }>({ url: "/news", method: "GET" }).then((r) => r.news),
    create: (payload: { kategorie: NewsKategorie; titel: string; body: string }) =>
      axiosClient<News>({ url: "/news", method: "POST", data: payload }),
    remove: (id: string) => axiosClient<void>({ url: `/news/${id}`, method: "DELETE" }),
  },

  // ── Eigenes Konto ──────────────────────────────────────────────────────────
  account: {
    /** Eigenes Passwort ändern (nur externe Kunden-Accounts). */
    changePassword: (neuesPasswort: string) =>
      axiosClient<{ ok: true }>({ url: "/account/password", method: "POST", data: { neuesPasswort } }),
    /** Seat-Code einlösen → Mandanten-Zugang freischalten (verifiziertes Konto ohne Mandant). */
    redeemSeat: (code: string) =>
      axiosClient<{ ok: true; tenant: { id: string; slug: string; name: string } }>({
        url: "/account/redeem-seat",
        method: "POST",
        data: { code },
      }),
    /** Hat der Nutzer die aktuelle Disclaimer-Version akzeptiert? */
    disclaimerStatus: () =>
      axiosClient<{ version: string; accepted: boolean }>({ url: "/account/disclaimer", method: "GET" }),
    /** Aktuellen Disclaimer akzeptieren. */
    acceptDisclaimer: () =>
      axiosClient<{ ok: true; version: string }>({ url: "/account/disclaimer", method: "POST" }),
    /** Eigene Mandanten-Lizenz (Plan, Laufzeit, Seat-Belegung). */
    license: () => axiosClient<AccountLicense>({ url: "/account/license", method: "GET" }),
    /** T-414: DSGVO-Self-Service-Datenexport des eigenen Mandanten (nur Tenant-Admin). */
    exportData: () => axiosClient<unknown>({ url: "/account/export", method: "GET", timeout: 60_000 }),
  },
}

export type { FindingSeverity }
