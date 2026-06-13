// Gateway-Auth: der Server hängt hinter setreo-proxy (Caddy forward_auth) und
// vertraut den dort gesetzten Headern. Trust internal, validate boundary.
//
// v2: Tenant-Kontext pro Request (req.ctx = { email, isAdmin, tenant }).
// - Non-Admin: Tenant über tenant_members (E-Mail) — kein Mapping → tenant null.
// - Admin (Rolle "admin"): Header X-Tenant wählt den Tenant, ohne Header → "setreo".
// Tenant-pflichtige Routen (projects/findings/stats) hängen requireTenant davor.

import { getTenantBySlug, getTenantForEmail } from "./tenants.js"
import { asyncHandler } from "./util.js"

export function authMiddleware({ requireAuth }) {
  return (req, res, next) => {
    // setreo-auth setzt X-Auth-User = User-ID (UUID) und X-Auth-Email = E-Mail.
    // Fürs tenant_members-Mapping zählt die E-Mail — X-Auth-Email bevorzugen,
    // Fallback X-Auth-User (Tests/ältere Gateways schicken dort die E-Mail).
    const userId = req.get("x-auth-user")
    const email = (req.get("x-auth-email") ?? userId ?? "").trim()
    // Auth-Quelle, vom Proxy gestempelt: "intern" (setreo-auth/Hub) oder "extern"
    // (setreo-auth-extern auf app.setreo-cloud.com). Clients können den Header
    // nicht fälschen — der Proxy strippt eingehende X-Auth-*. Fehlt er → intern.
    const gateway = (req.get("x-auth-gateway") ?? "intern").trim().toLowerCase()
    if (!email) {
      if (requireAuth) return res.status(401).json({ error: "Nicht angemeldet" })
      // Dev ohne Gateway: anonymer Dev-User mit vollen Rechten
      req.user = { email: "dev@local", roles: ["admin"], gateway: "intern" }
      return next()
    }
    let roles = (req.get("x-auth-roles") ?? "")
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean)
    // Externe Identitäten bekommen NIE interne Rollen — egal was im Header steht.
    // "admin" existiert nur im internen Gateway; extern zählt allein tenant_members.
    if (gateway === "extern") roles = ["extern"]
    req.user = { email, roles, gateway }
    next()
  }
}

/** Schreibende Endpoints: mindestens eine der angegebenen Rollen. */
export function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles ?? []
    if (!allowed.some((r) => roles.includes(r))) {
      return res.status(403).json({ error: "Keine Berechtigung" })
    }
    next()
  }
}

/** Hängt req.ctx = { email, isAdmin, tenant } an — lehnt selbst nichts ab. */
export function tenantContext({ db }) {
  return asyncHandler(async (req, res, next) => {
    const email = String(req.user?.email ?? "").toLowerCase()
    const isAdmin = (req.user?.roles ?? []).includes("admin")

    let tenant = null
    if (isAdmin) {
      const slug = (req.get("x-tenant") ?? "setreo").trim().toLowerCase()
      tenant = await getTenantBySlug(db, slug)
    } else {
      tenant = await getTenantForEmail(db, email)
    }
    req.ctx = { email, isAdmin, tenant }
    next()
  })
}

/** Tenant-pflichtige Routen: ohne Mandanten-Zuordnung → 403 "kein-mandant". */
export function requireTenant(req, res, next) {
  if (!req.ctx?.tenant) return res.status(403).json({ error: "kein-mandant" })
  next()
}
