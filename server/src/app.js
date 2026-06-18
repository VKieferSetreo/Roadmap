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
import { authMiddleware, requireTenant, tenantContext } from "./auth.js"
import { createDefaultDb } from "./db.js"
import { createNominatim } from "./external/nominatim.js"
import { createOsrm } from "./external/osrm.js"
import { adminImportRouter } from "./routes/adminImport.js"
import { adminTenantsRouter } from "./routes/adminTenants.js"
import { bugReportsRouter } from "./routes/bugReports.js"
import { sourceRequestsRouter } from "./routes/sourceRequests.js"
import { newsRouter } from "./routes/news.js"
import { hiddenFindingsRouter } from "./routes/hiddenFindings.js"
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
import { listTenants, RESERVED_SLUGS, SLUG_RE } from "./tenants.js"
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

  const app = express()
  app.disable("x-powered-by")
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
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, version: APP_VERSION })
  })

  // ── Public-Share (UNGATED — Proxy routet /_share ohne forward_auth) ─────────
  app.use("/_share", shareRouter({ db, sessionSalt }))
  // Statisches Share-FE; Verzeichnis wird später vendored — fehlt es, greift 404
  app.use("/_share", express.static(shareDir))

  // ── Gated API ────────────────────────────────────────────────────────────────
  app.use("/api", authMiddleware({ requireAuth }))
  app.use("/api", tenantContext({ db }))

  // gated, aber ohne Tenant-Pflicht — speist Identität + Tenant-Switcher des FE
  app.get("/api/context", asyncHandler(async (req, res) => {
    const { email, isAdmin, tenant } = req.ctx
    res.json({
      email,
      isAdmin,
      // extern = Login über setreo-auth-extern (Kunden-Gateway). Steuert FE: eigenes
      // Passwort änderbar + Logo führt zur Projektübersicht statt zum Hub-Admin.
      extern: req.user?.gateway === "extern",
      tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
      ...(isAdmin && { tenants: await listTenants(db) }),
    })
  }))

  app.use("/api/admin/tenants", adminTenantsRouter({ db, fetchImpl, authExtern }))
  app.use("/api/admin/hidden-findings", hiddenFindingsRouter({ db }))
  app.use("/api/admin", adminImportRouter({ db, fetchImpl }))
  app.use("/api/projects", requireTenant, projectsRouter({ db, corridorM, shareBaseUrl }))
  app.use("/api/findings", requireTenant, findingsRouter({ db }))
  app.use("/api/stats", requireTenant, statsRouter({ db }))
  app.use("/api/notifications", requireTenant, notificationsRouter({ db }))
  app.use("/api/obstacles", obstaclesRouter({ db }))
  // Analytics: Heartbeat (jeder eingeloggte Nutzer) + Übersicht (nur Admin, intern gegated).
  // KEIN requireTenant — der Heartbeat soll auch für (noch) mandantenlose Nutzer zählen.
  app.use("/api/analytics", analyticsRouter({ db }))
  app.use("/api/geocode", geoRouter({ db, nominatim }))
  // Routen-Berechnung (Start/Ziel + Google-Maps-Link) → optimaler Straßenweg via OSRM.
  app.use("/api/route", routeRouter({ db, nominatim, osrm, fetchImpl }))
  // Sync ("alle Quellen aktualisieren") — jeder eingeloggte Nutzer, kein Tenant-Zwang
  app.use("/api/sync", syncRouter({ db, fetchImpl, env: process.env, connectors: syncConnectors }))
  // Bug-Reports — melden darf jeder Eingeloggte; Liste/Triage nur Admin (im Router gegated)
  app.use("/api/bug-reports", bugReportsRouter({ db }))
  app.use("/api/source-requests", sourceRequestsRouter({ db }))
  // News-Feed — Liste für jeden Eingeloggten, Anlegen/Löschen nur Admin (im Router gegated)
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
    console.error(err)
    res.status(500).json({ error: "Interner Fehler" })
  })

  return app
}
