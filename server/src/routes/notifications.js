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

  return r
}
