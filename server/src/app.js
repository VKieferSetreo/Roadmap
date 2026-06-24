// Express-App als Factory-Export (supertest-fähig, db/fetch injectable).
//
// Routing-Schichten v2:
//   /api/health                       — immer ungated (Docker/Proxy-Probes)
//   /_share/**                        — UNGATED Public-Share (eigener Router + Assets)
//   /api/**                           — Gateway-Auth + Tenant-Kontext
//     /api/context                    — gated, aber OHNE Tenant-Pflicht
//     /api/admin/tenants              — Admin only, ohne Tenant-Pflicht
//     /api/admin/import*              — Admin only (Import-Runs + manueller Trigger, v3)
//     /api/projects|findings|stats    — Tenant-Pflicht (403 "kein-mandant")
//     /api/obstacles|geocode          — global (zentrale Hindernis-DB / Geocoding)
//   GET /:tenantSlug/:projectId       — Share-SPA-HTML (nach allen API-Routen)

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import compression from "compression"
import { createRateLimiter } from "./shares.js"
import { authMiddleware, requireTenant, tenantContext } from "./auth.js"
import { createDefaultDb } from "./db.js"
import { requestId } from "./requestId.js"
import { captureException } from "./sentry.js"
import { createNominatim } from "./external/nominatim.js"
import { createOsrm } from "./external/osrm.js"
import { allConnectors } from "./connectors/index.js"
import { ABDECKUNG_DATA, ABDECKUNG_HINWEIS, ABDECKUNG_KATS, ABDECKUNG_STAND } from "./abdeckung.js"
import { adminImportRouter } from "./routes/adminImport.js"
import { adminTenantsRouter } from "./routes/adminTenants.js"
import { bugReportsRouter } from "./routes/bugReports.js"
import { sourceRequestsRouter } from "./routes/sourceRequests.js"
import { newsRouter } from "./routes/news.js"
import { hiddenFindingsRouter } from "./routes/hiddenFindings.js"
import { internalRouter } from "./routes/internal.js"
import { foldersRouter } from "./routes/folders.js"
import { findingChatRouter } from "./routes/findingChat.js"
import { findingsRouter } from "./routes/findings.js"
import { geoRouter } from "./routes/geo.js"
import { notificationsRouter } from "./routes/notifications.js"
import { obstaclesRouter } from "./routes/obstacles.js"
import { projectsRouter } from "./routes/projects.js"
import { shareRouter } from "./routes/share.js"
import { statsRouter } from "./routes/stats.js"
import { syncRouter } from "./routes/sync.js"
import { accountRouter } from "./routes/account.js"
import { routeRouter } from "./routes/route.js"
import { analyticsRouter } from "./routes/analytics.js"
import { getTenantBranding, listTenants, RESERVED_SLUGS, SLUG_RE } from "./tenants.js"
import { ApiError, asyncHandler, isUuid } from "./util.js"

// Version single-sourced aus server/package.json (kein doppeltes Pflegen, erscheint in den
// Einstellungen). Robuster Fallback, damit ein Lesefehler den Boot nie verhindert (T-175).
function readAppVersion() {
  try {
    return JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ).version
  } catch {
    return "0.0.0"
  }
}

export const APP_VERSION = readAppVersion()

const SHARE_DIR = fileURLToPath(new URL("../public/share", import.meta.url))

export function createApp({
  db = createDefaultDb(),
  fetchImpl = globalThis.fetch,
  requireAuth = process.env.REQUIRE_AUTH === "true",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  // Korridor-Halbbreite (m): max. Abstand eines Hindernisses zur Route, damit es als
  // Fund zählt. 20 m je Seite (Max 2026-06-14): nur was DIREKT an der Strecke liegt —
  // 50/120 m fingen Parallel-/Seitenstraßen mit ein („nur in der Nähe" = Bloat). 20 m
  // hält Toleranz für GPS-Ungenauigkeit + Fahrbahnversatz (Gegenfahrbahn), schließt aber
  // Nachbarstraßen aus. Das Strecken-Matching nutzt die Linien-Geometrie (geom), damit
  // eine an der Route entlanglaufende Maßnahme trotz versetztem Mittelpunkt greift.
  // Per CORRIDOR_M übersteuerbar.
  corridorM = Number(process.env.CORRIDOR_M ?? 20),
  shareBaseUrl = process.env.SHARE_BASE_URL ?? "https://setreo-cloud.com",
  sessionSalt = process.env.SESSION_SALT ?? "roadmap-dev-salt",
  shareDir = SHARE_DIR,
  // setreo-auth-extern (Kunden-Accounts): ohne Konfiguration antwortet
  // POST /api/admin/tenants/:id/users mit 503 — Rest der API unberührt.
  authExtern = {
    url: (process.env.AUTH_EXTERN_URL ?? "").replace(/\/$/, ""),
    secret: process.env.AUTH_EXTERN_PROVISION_SECRET ?? "",
  },
  // Nur für Tests: kleiner deterministischer Connector-Satz für den Sync-Button.
  // Prod lässt das weg → startSync zieht allConnectors (alle registrierten Quellen).
  syncConnectors,
} = {}) {
  const nominatim = createNominatim({ fetchImpl, timeoutMs })
  // OSRM-Router (Deutschland-Graph, eigene Coolify-App). Großzügiger Timeout — lange
  // Strecken brauchen mehr als der Geocoder-Default. OSRM down → resolveRoute fällt auf
  // den deterministischen Geometrie-Fallback zurück.
  const osrm = createOsrm({ fetchImpl, timeoutMs: 20000 })

  // T-425/T-301#12: in Prod (requireAuth) NICHT mit dem Dev-Default-Salt laufen — Share-/Session-
  // Tokens wären sonst vorhersehbar ableitbar (Forgery). Jetzt FAIL-FAST statt nur Warnung: lieber
  // ein lauter Boot-Abbruch als eine still mit Dev-Salt laufende Prod-Instanz. requireAuth ist das
  // Prod-Signal (Tests/Dev laufen mit requireAuth=false → Dev-Salt bleibt dort erlaubt).
  if (requireAuth && sessionSalt === "roadmap-dev-salt") {
    throw new Error(
      "[BOOT] SESSION_SALT fehlt in Produktion (Dev-Default aktiv) — Boot abgebrochen. " +
        "SESSION_SALT setzen (openssl rand -hex 32).",
    )
  }

  const app = express()
  app.disable("x-powered-by")
  // T-335: ein Hop (Caddy) ist vertrauenswürdig → req.ip = die von Caddy gesetzte echte Client-IP
  // (Cf-Connecting-Ip auf den _share-Blöcken). Kette: cloudflared → Caddy → roadmap-api.
  app.set("trust proxy", 1)
  app.use(requestId()) // T-468: Request-/Trace-ID-Korrelation, ganz früh (vor allem inkl. Health)
  // T-312: gzip — die Hindernis-/Projekt-Responses sind groß (z.B. ~39k aktive Hindernisse,
  // ~15-20 MB JSON) → komprimiert ~2-3 MB auf der Leitung. Greift für alle Responses.
  app.use(compression())
  app.use(express.json({ limit: "20mb" }))

  // IMMER ungated (Docker-HEALTHCHECK, Proxy-Probes)
  app.get("/api/health", async (req, res) => {
    let dbOk = false
    try {
      await db.query("SELECT 1")
      dbOk = true
    } catch {
      // db down → ok:false, aber Endpoint antwortet
    }
    // T-471: OSRM (eigene Coolify-App) mitprüfen, aber NUR als Info — Gesamtstatus bleibt an db
    // gekoppelt. Sonst killt der Docker-HEALTHCHECK (exit 1 bei !=200) die API bei jedem OSRM-Blip.
    const osrmOk = osrm ? await osrm.ping().catch(() => false) : false // T-338: osrm kann null sein (nicht konfiguriert)
    // T-469: Worker-Dead-Man's-Switch — Heartbeat-Staleness als Info-Flag, ebenfalls NICHT am
    // Gesamtstatus (ein toter Worker darf die API nicht als down markieren). >2h ohne Beat = stale.
    let workerStale = false
    if (dbOk) {
      try {
        const { rows } = await db.query("SELECT last_beat FROM worker_heartbeat WHERE id = 1")
        const last = rows[0]?.last_beat ? new Date(rows[0].last_beat).getTime() : 0
        workerStale = !last || Date.now() - last > 2 * 60 * 60 * 1000
      } catch {
        // Tabelle fehlt (vor Migration 040) → kein Flag
      }
    }
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      db: dbOk,
      osrm: osrmOk,
      ...(workerStale ? { worker: "stale" } : {}),
      ...(dbOk && !osrmOk ? { degraded: true } : {}),
      version: APP_VERSION,
    })
  })

  // ── Public-Share (UNGATED — Proxy routet /_share ohne forward_auth) ─────────
  app.use("/_share", shareRouter({ db, sessionSalt }))
  // Statisches Share-FE; Verzeichnis wird später vendored — fehlt es, greift 404
  app.use("/_share", express.static(shareDir))

  // Service-zu-Service (auth-extern → roadmap-api): VOR der Gateway-Auth, da der Aufruf
  // KEINE X-Auth-Header trägt (Docker-Netz, direkt). Eigener Secret-Gate im Router.
  app.use("/api/internal", internalRouter({ db, provisionSecret: process.env.AUTH_EXTERN_PROVISION_SECRET ?? "" }))

  // Datenabdeckung (T-482): EINE Quelle für das interne Board UND die öffentliche /roadmap/abdeckung-
  // Seite. UNGATED — die öffentliche Seite trägt keine Auth; gibt NUR die redaktionelle Matrix +
  // echte Connector-Zahl + Stand zurück, KEINE Mandanten-/Bestandsdaten (Leak-Check: unbedenklich).
  app.get("/api/abdeckung", (req, res) => {
    res.json({
      kats: ABDECKUNG_KATS,
      data: ABDECKUNG_DATA,
      stand: ABDECKUNG_STAND,
      // allConnectors (nicht enabledConnectors): die api hat keine CONNECTORS-Env (nur der Worker
      // schedulet) → enabled wäre 0. allConnectors = alle angebundenen Quellen (statisch + Mobilithek).
      connectoren: allConnectors().length,
      hinweis: ABDECKUNG_HINWEIS,
    })
  })

  // ── Gated API ────────────────────────────────────────────────────────────────
  // T-357: Defense-in-Depth — gated /api/* nimmt X-Auth-* nur an, wenn der Request über den
  // Gateway (Caddy) kam. Caddy stempelt X-Gateway-Secret (header_up); ein Direktzugriff am Proxy
  // vorbei (Docker-Netz-Lateral / künftige Ingress-Fehlkonfiguration) trägt es nicht → 401. Greift
  // NUR bei gesetztem GATEWAY_SECRET (sonst no-op: Dev/Tests + vor dem staged Rollout kein Lockout).
  // Steht NACH health/internal/abdeckung (Z.120/160/165) → diese Direkt-Pfade bleiben exempt
  // (Coolify-Healthcheck auf 127.0.0.1, auth-extern-Service-Call, öffentliche Abdeckung).
  const gatewaySecret = process.env.GATEWAY_SECRET ?? ""
  if (gatewaySecret) {
    app.use("/api", (req, res, next) => {
      if (req.get("x-gateway-secret") !== gatewaySecret) {
        return res.status(401).json({ error: "Nicht angemeldet" })
      }
      next()
    })
  }
  app.use("/api", authMiddleware({ requireAuth }))
  app.use("/api", tenantContext({ db }))

  // T-337: globaler DoS-/Runaway-Backstop je Identität. req.ip ist auf den gated /api-Blöcken die
  // geteilte Caddy-IP (Caddy stempelt dort kein XFF) → MUSS per Identität keyen, sonst ein Eimer
  // für alle. Großzügig (1200/min ≈ 20/s): fängt Endlosschleife/Abuse, trifft nie legitime Nutzung.
  const apiLimiter = createRateLimiter({ max: 1200, windowMs: 60_000 })
  app.use("/api", (req, res, next) => {
    const key = req.ctx?.email || req.user?.email || req.ip || "anon"
    if (!apiLimiter(key)) throw new ApiError(429, "Zu viele Anfragen — bitte kurz warten")
    next()
  })

  // gated, aber ohne Tenant-Pflicht — speist Identität + Tenant-Switcher des FE
  app.get("/api/context", asyncHandler(async (req, res) => {
    const { email, isAdmin, isTenantAdmin, tenant } = req.ctx
    res.json({
      email,
      isAdmin,
      // Tenant-Admin (T-147): darf eigene Nutzer/Seats verwalten (FE schaltet das UI frei).
      isTenantAdmin: Boolean(isTenantAdmin),
      // extern = Login über setreo-auth-extern (Kunden-Gateway). Steuert FE: eigenes
      // Passwort änderbar + Logo führt zur Projektübersicht statt zum Hub-Admin.
      extern: req.user?.gateway === "extern",
      // branding = White-Label (Logo/Akzentfarbe/Tab-Name) des aktiven Mandanten → FE thematisiert beim Laden.
      tenant: tenant
        ? { id: tenant.id, slug: tenant.slug, name: tenant.name, branding: await getTenantBranding(db, tenant.id) }
        : null,
      ...(isAdmin && { tenants: await listTenants(db) }),
    })
  }))

  app.use("/api/admin/tenants", adminTenantsRouter({ db, fetchImpl, authExtern }))
  app.use("/api/admin/hidden-findings", hiddenFindingsRouter({ db }))
  app.use("/api/admin", adminImportRouter({ db, fetchImpl }))
  app.use("/api/projects", requireTenant, projectsRouter({ db, corridorM, shareBaseUrl }))
  app.use("/api/folders", requireTenant, foldersRouter({ db }))
  app.use("/api/finding-chat", requireTenant, findingChatRouter({ db }))
  // T-392: die ILIKE-Volltextsuche (?q=) ist ein nicht-indizierter Seq-Scan über alle Tenant-Funde
  // bzw. -Hindernisse. Der globale 1200/min-Backstop fängt Runaway, aber die Suche ist teurer als
  // ein normaler Read → eigener, strafferer Eimer NUR auf dem Such-Pfad (q gesetzt). pg_trgm/GIN
  // wäre bei aktueller Tenant-Größe (wenige Tausend Zeilen) Over-Engineering — der Limiter schließt
  // den Spam-Vektor, der Seq-Scan selbst bleibt schnell.
  const searchLimiter = createRateLimiter({ max: 90, windowMs: 60_000 })
  const guardSearch = (req, _res, next) => {
    if (req.query?.q) {
      const key = req.ctx?.email || req.user?.email || req.ip || "anon"
      if (!searchLimiter(key)) throw new ApiError(429, "Zu viele Suchanfragen — bitte kurz warten")
    }
    next()
  }

  app.use("/api/findings", requireTenant, guardSearch, findingsRouter({ db }))
  app.use("/api/stats", requireTenant, statsRouter({ db }))
  app.use("/api/notifications", requireTenant, notificationsRouter({ db }))
  // T-304: daten-liefernde Routen sind tenant-pflichtig — sonst liest ein verifizierter
  // No-Seat-Externer (req.ctx.tenant=null) über "tenant_id IS NULL" den kompletten globalen
  // Hindernis-Datensatz (das verkaufte Asset). Interne SSO-Nutzer bekommen auto-"setreo" und
  // sind nicht betroffen; account/analytics/bug-reports bleiben bewusst offen (Seat-Redeem,
  // Heartbeat, Fehler-Melden brauchen No-Seat-Zugang).
  // T-336: GET /api/obstacles kann den gesamten (großen) Hindernis-Datensatz serialisieren
  // (?geom=true ~35 MB). requireTenant gated den Zugriff (T-304); guardSearch limitiert nur ?q=.
  // Eigener, generöser Eimer (60/min je Identität) deckelt den schweren Voll-Read als DoS-Vektor —
  // legitime FE-Ladungen (DB-Tab/Karte) bleiben weit darunter. (bbox-Viewport-Loading = T-312/502.)
  const obstaclesLimiter = createRateLimiter({ max: 60, windowMs: 60_000 })
  app.use("/api/obstacles", (req, res, next) => {
    const key = req.ctx?.email || req.user?.email || req.ip || "anon"
    if (!obstaclesLimiter(key)) throw new ApiError(429, "Zu viele Hindernis-Abfragen — bitte kurz warten")
    next()
  })
  app.use("/api/obstacles", requireTenant, guardSearch, obstaclesRouter({ db }))
  // Analytics: Heartbeat (jeder eingeloggte Nutzer) + Übersicht (nur Admin, intern gegated).
  // KEIN requireTenant — der Heartbeat soll auch für (noch) mandantenlose Nutzer zählen.
  app.use("/api/analytics", analyticsRouter({ db }))
  app.use("/api/geocode", requireTenant, geoRouter({ db, nominatim, fetchImpl }))
  // Routen-Berechnung (Start/Ziel + Google-Maps-Link) → optimaler Straßenweg via OSRM.
  // T-393: eigener, strengerer Eimer (30/min je Identität) vor dem globalen Backstop, weil
  // jeder Request outbound OSRM/Nominatim trifft (teurer als reine DB-Reads).
  const routeLimiter = createRateLimiter({ max: 30, windowMs: 60_000 })
  app.use("/api/route", (req, res, next) => {
    const key = req.ctx?.email || req.user?.email || req.ip || "anon"
    if (!routeLimiter(key)) throw new ApiError(429, "Zu viele Routen-Anfragen — bitte kurz warten")
    next()
  })
  app.use("/api/route", requireTenant, routeRouter({ db, nominatim, osrm, fetchImpl }))
  // Sync ("alle Quellen aktualisieren") — Status für jeden Eingeloggten sichtbar; den
  // globalen Voll-Pull-Trigger (POST /) dürfen NUR interne Nutzer auslösen (T-309, im Router).
  app.use("/api/sync", syncRouter({ db, fetchImpl, env: process.env, connectors: syncConnectors }))
  // Bug-Reports — melden darf jeder Eingeloggte; Liste/Triage nur Admin (im Router gegated)
  app.use("/api/bug-reports", bugReportsRouter({ db }))
  app.use("/api/source-requests", requireTenant, sourceRequestsRouter({ db }))
  // News-Feed — bewusst für JEDEN Eingeloggten sichtbar (auch No-Seat/extern): Ankündigungen,
  // nicht der verkaufte Datensatz (siehe news.test.js). Anlegen/Löschen nur Admin (im Router).
  app.use("/api/news", newsRouter({ db }))
  // Eigenes Konto: Passwortänderung (extern) + Seat-Code-Einlösung (ohne Tenant-Pflicht)
  app.use("/api/account", accountRouter({ db, fetchImpl, authExtern }))

  app.use("/api", (req, res) => res.status(404).json({ error: "Nicht gefunden" }))

  // ── Share-SPA (NACH allen API-Routen): /<tenantSlug>/<projectId> → index.html
  // Validierung light — der Client zeigt den 404-Screen über die Share-API.
  app.get("/:tenantSlug/:projectId", (req, res, next) => {
    const { tenantSlug, projectId } = req.params
    if (!SLUG_RE.test(tenantSlug) || RESERVED_SLUGS.includes(tenantSlug) || !isUuid(projectId)) {
      return next()
    }
    const indexHtml = join(shareDir, "index.html")
    if (!existsSync(indexHtml)) {
      return res
        .status(503)
        .json({ error: "Share-Frontend noch nicht installiert (server/public/share fehlt)" })
    }
    res.sendFile(indexHtml)
  })

  // zentraler Error-Handler (4-Arg-Signatur ist für Express signifikant)
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Ungültiges JSON" })
    }
    // T-389: Pool-Erschöpfung / DB-Verbindungsabriss als 503 + Retry-After surfacen statt
    // generischem 500 — der Client darf dann sinnvoll erneut versuchen.
    if (err?.message && /timeout exceeded when trying to connect|Connection terminated|too many clients/i.test(err.message)) {
      res.set("Retry-After", "5")
      return res.status(503).json({ error: "Dienst momentan ausgelastet, bitte erneut versuchen" })
    }
    console.error(`[api ${new Date().toISOString()}] ${req.method} ${req.path} [${req.requestId ?? "-"}]`, err)
    captureException(err, { requestId: req.requestId, method: req.method, path: req.path }) // T-468: GlitchTip
    res.status(500).json({ error: "Interner Fehler", requestId: req.requestId })
  })

  return app
}
