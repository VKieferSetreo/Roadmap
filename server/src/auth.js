// Gateway-Auth: der Server hängt hinter setreo-proxy (Caddy forward_auth) und
// vertraut den dort gesetzten Headern. Trust internal, validate boundary.
//
// v2: Tenant-Kontext pro Request (req.ctx = { email, isAdmin, tenant }).
// - Non-Admin extern: Tenant über tenant_members (E-Mail) — kein Mapping → tenant null.
// - Non-Admin intern (Setreo-Hub-SSO): ohne tenant_members-Zeile automatisch Mandant "setreo"
//   (kein eigenes Roadmap-Passwort, keine Provisionierung nötig — SSO genügt).
// - Admin (Rolle "admin"): Header X-Tenant wählt den Tenant, ohne Header → "setreo".
// Tenant-pflichtige Routen (projects/findings/stats) hängen requireTenant davor.

// Interner Default-Mandant für SSO-Nutzer ohne explizite tenant_members-Zuordnung.
// Identisch zum Admin-Default ("setreo", siehe tenantContext). ponytail: hardcoded wie
// dort — bei Umbenennung beide Stellen ändern.
const INTERNAL_TENANT_SLUG = "setreo"

import { getTenantBySlug, getTenantForEmail } from "./tenants.js"
import { asyncHandler } from "./util.js"

// Admin-Rechte (Mandanten-Wechsel, Debugging, globale Schreibrechte) auf eine E-Mail-Allowlist
// beschränken: NUR wenn ROADMAP_ADMIN_EMAILS gesetzt ist, gilt sie — dann bekommen ALLE anderen
// internen Hub-Nutzer normale User-Rechte (kein Switch/Debugging/Global-Write), Tenant-Zugang
// bleibt. Ist die Env nicht gesetzt (z.B. Tests/Dev), greift das bisherige Verhalten. Per-Request
// gelesen, damit die Liste ohne Code-Deploy pflegbar ist. Prod: "mxk@setreo.de,vki@setreo.de".
function adminAllowlist() {
  return String(process.env.ROADMAP_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
}

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
    if (gateway === "extern") {
      roles = ["extern"]
    } else {
      const allow = adminAllowlist()
      if (allow.length > 0 && !allow.includes(email.toLowerCase())) {
        // Interner Hub-Nutzer, aber NICHT in der Admin-Allowlist → normale User-Rechte:
        // kein Mandanten-Wechsel, kein Debugging, kein globaler Schreibzugriff. Tenant-Zugang
        // (über tenant_members) bleibt. So bekommt nicht jeder Hub-Nutzer Admin auf Roadmap.
        roles = roles.filter((r) => r !== "admin" && r !== "roadmap")
      }
    }
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
      // Interner SSO-Nutzer (Setreo-Hub, gateway != "extern") ohne explizite Mitgliedschaft:
      // automatisch dem Setreo-Mandanten zuordnen — so braucht kein interner Nutzer ein
      // eigenes Roadmap-Passwort oder eine vorab angelegte tenant_members-Zeile. Externe
      // (gateway "extern") bleiben strikt auf ihre Mitgliedschaft beschränkt → sonst 403.
      if (!tenant && req.user?.gateway !== "extern") {
        tenant = await getTenantBySlug(db, INTERNAL_TENANT_SLUG)
      }
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
