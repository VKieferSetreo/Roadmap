// Nachrichtenzentrum/Glocke: Benachrichtigungen des aktiven Mandanten.
// Tenant-pflichtig (requireTenant davor) — jeder Eintrag gehört genau einem
// Mandanten; Admins sehen die des aktuell gewählten Tenants (X-Tenant).

import { Router } from "express"
import { rowToNotification } from "../map.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

export function notificationsRouter({ db }) {
  const r = Router()

  /** Liste (neueste zuerst, max 100) + Zähler der ungelesenen. */
  r.get("/", asyncHandler(async (req, res) => {
    const tenantId = req.ctx.tenant.id
    const { rows } = await db.query(
      "SELECT * FROM notifications WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100",
      [tenantId],
    )
    const unreadCount = rows.filter((x) => x.read_at == null).length
    res.json({ notifications: rows.map(rowToNotification), unreadCount })
  }))

  /** Nur der Zähler (für Glocken-Badge-Polling — schlank). */
  r.get("/unread-count", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT count(*)::int AS n FROM notifications WHERE tenant_id = $1 AND read_at IS NULL",
      [req.ctx.tenant.id],
    )
    res.json({ count: rows[0]?.n ?? 0 })
  }))

  /** Eine Nachricht als gelesen markieren. */
  r.post("/:id/read", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Nachricht nicht gefunden")
    const result = await db.query(
      "UPDATE notifications SET read_at = now() WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL",
      [req.params.id, req.ctx.tenant.id],
    )
    res.json({ updated: result.rowCount })
  }))

  /** Alle als gelesen markieren. */
  r.post("/read-all", asyncHandler(async (req, res) => {
    const result = await db.query(
      "UPDATE notifications SET read_at = now() WHERE tenant_id = $1 AND read_at IS NULL",
      [req.ctx.tenant.id],
    )
    res.json({ updated: result.rowCount })
  }))

  /** Alle Nachrichten des Mandanten löschen (Papierkorb im Nachrichtenzentrum). */
  r.delete("/", asyncHandler(async (req, res) => {
    const result = await db.query("DELETE FROM notifications WHERE tenant_id = $1", [req.ctx.tenant.id])
    res.json({ deleted: result.rowCount })
  }))

  // ── E-Mail-Benachrichtigungs-Präferenz je (Mandant, Adresse) ────────────────
  const ALL_SEV = ["kritisch", "warnung", "hinweis"]
  const DEFAULT_PREF = { enabled: true, scope: "eigene", severities: ALL_SEV }

  /** Präferenz des angemeldeten Nutzers (Default, wenn keine Zeile). */
  r.get("/mail-pref", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT enabled, scope, severities FROM mail_prefs WHERE tenant_id = $1 AND email = $2",
      [req.ctx.tenant.id, req.ctx.email],
    )
    if (rows.length === 0) return res.json(DEFAULT_PREF)
    res.json({ enabled: rows[0].enabled, scope: rows[0].scope, severities: rows[0].severities })
  }))

  /** Präferenz setzen (an/aus, Scope eigene|alle, Schweregrade). */
  r.post("/mail-pref", asyncHandler(async (req, res) => {
    const enabled = req.body?.enabled !== false
    const scope = req.body?.scope === "alle" ? "alle" : "eigene"
    const sevIn = Array.isArray(req.body?.severities) ? req.body.severities : ALL_SEV
    const severities = ALL_SEV.filter((s) => sevIn.includes(s))
    await db.query(
      `INSERT INTO mail_prefs (tenant_id, email, enabled, scope, severities)
         VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (tenant_id, email)
         DO UPDATE SET enabled = $3, scope = $4, severities = $5::jsonb`,
      [req.ctx.tenant.id, req.ctx.email, enabled, scope, JSON.stringify(severities)],
    )
    res.json({ enabled, scope, severities })
  }))

  return r
}
