// Public-Share-API — UNGATED (kein X-Auth, läuft im setreo-proxy ohne forward_auth).
// Externe sehen NUR die gestrippte Sicht (Karte + Auswertung): rowToShareData.
// Passwort-Shares: unlock → stateless HMAC-Token, Folge-GETs mit Bearer-Token.

import { Router } from "express"
import { rowToFinding, rowToShareData } from "../map.js"
import { createRateLimiter, shareToken, verifyPassword, verifyShareToken } from "../shares.js"
import { SLUG_RE } from "../tenants.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

/** Aktiver Share inkl. Projekt-Name, strikt über tenantSlug + projectId. */
async function loadActiveShare(db, tenantSlug, projectId) {
  if (!SLUG_RE.test(tenantSlug) || !isUuid(projectId)) return null
  const { rows } = await db.query(
    `SELECT s.*, p.name AS project_name FROM shares s
       JOIN projects p ON p.id = s.project_id
       JOIN tenants t ON t.id = s.tenant_id
     WHERE s.project_id = $1 AND t.slug = $2 AND s.revoked_at IS NULL`,
    [projectId, tenantSlug],
  )
  return rows[0] ?? null
}

// Defense-in-Depth (T-156): Projekt + Findings strikt über tenant_id selbst-absichern.
// Ungated Endpoint — nicht allein auf die loadActiveShare-Validierung verlassen.
async function loadShareData(db, projectId, tenantId) {
  const project = await db.query(
    "SELECT * FROM projects WHERE id = $1 AND tenant_id = $2",
    [projectId, tenantId],
  )
  if (!project.rows[0]) throw new ApiError(404, "Share nicht gefunden")
  const findings = await db.query(
    `SELECT f.* FROM findings f
       JOIN projects p ON p.id = f.project_id
     WHERE f.project_id = $1 AND p.tenant_id = $2
     ORDER BY f.km ASC`,
    [projectId, tenantId],
  )
  // Ausgeblendete Funde dürfen extern NIE erscheinen (Karte + Auswertung).
  const hidden = await db.query(
    "SELECT finding_key, grund, grund_text FROM hidden_findings WHERE project_id = $1",
    [projectId],
  )
  const hiddenKeys = new Set(hidden.rows.map((h) => h.finding_key))
  const sichtbar = findings.rows.map(rowToFinding).filter((f) => !hiddenKeys.has(f.key))
  return rowToShareData(project.rows[0], sichtbar)
}

export function shareRouter({ db, sessionSalt }) {
  const r = Router()
  const allowUnlock = createRateLimiter({ max: 10, windowMs: 60_000 })

  r.get("/api/:tenantSlug/:projectId", asyncHandler(async (req, res) => {
    const share = await loadActiveShare(db, req.params.tenantSlug, req.params.projectId)
    if (!share) throw new ApiError(404, "Share nicht gefunden")

    if (share.pw_hash != null) {
      const auth = req.get("authorization") ?? ""
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
      if (!token || !verifyShareToken(token, share.project_id, share.pw_hash, sessionSalt)) {
        return res.json({ locked: true, name: share.project_name })
      }
    }
    res.json({ locked: false, data: await loadShareData(db, share.project_id, share.tenant_id) })
  }))

  r.post("/api/:tenantSlug/:projectId/unlock", asyncHandler(async (req, res) => {
    if (!allowUnlock(req.ip ?? "unknown")) {
      throw new ApiError(429, "Zu viele Versuche — kurz warten")
    }
    const share = await loadActiveShare(db, req.params.tenantSlug, req.params.projectId)
    if (!share) throw new ApiError(404, "Share nicht gefunden")

    if (share.pw_hash != null) {
      const password = req.body?.password
      if (typeof password !== "string" || !(await verifyPassword(password, share.pw_hash))) {
        throw new ApiError(401, "Falsches Passwort")
      }
    }
    res.json({
      token: share.pw_hash != null ? shareToken(share.project_id, share.pw_hash, sessionSalt) : null,
      data: await loadShareData(db, share.project_id, share.tenant_id),
    })
  }))

  return r
}
