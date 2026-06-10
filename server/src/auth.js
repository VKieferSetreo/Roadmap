// Gateway-Auth: der Server hängt hinter setreo-proxy (Caddy forward_auth) und
// vertraut den dort gesetzten Headern. Trust internal, validate boundary.

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
