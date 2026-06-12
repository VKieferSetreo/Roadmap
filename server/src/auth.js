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
    const email = req.get("x-auth-user")
    if (!email) {
      if (requireAuth) return res.status(401).json({ error: "Nicht angemeldet" })
      // Dev ohne Gateway: anonymer Dev-User mit vollen Rechten
      req.user = { email: "dev@local", roles: ["admin"] }
      return next()
    }
    const roles = (req.get("x-auth-roles") ?? "")
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean)
    req.user = { email, roles }
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
