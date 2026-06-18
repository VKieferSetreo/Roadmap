// Quellen-Vorschläge: Nutzer schlagen neue Datenquellen vor (URL + Beschreibung).
//   POST  /api/source-requests          — jeder eingeloggte Nutzer (kein Tenant-Zwang)
//   GET   /api/source-requests          — nur Admin (Triage auf /debug)
//   PATCH /api/source-requests/:id       — nur Admin (Status/Notiz)
//   DELETE /api/source-requests/:id      — nur Admin
//
// Vorschlagender + Mandant kommen aus req.ctx (serverseitig). Spiegelt das Bug-Report-Muster.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { rowToSourceRequest } from "../map.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

const STATUS = new Set(["offen", "in_arbeit", "erledigt", "verworfen"])
const MAX_URL = 2000
const MAX_BESCHREIBUNG = 5000

export function sourceRequestsRouter({ db }) {
  const r = Router()

  /** Vorschlagen — jeder eingeloggte Nutzer. */
  r.post("/", asyncHandler(async (req, res) => {
    const url = String(req.body?.url ?? "").trim()
    if (!url) throw new ApiError(400, "Bitte gib die URL der Quelle an.")
    if (url.length > MAX_URL) throw new ApiError(400, "URL zu lang.")
    if (!/^https?:\/\//i.test(url)) throw new ApiError(400, "Bitte eine vollständige URL angeben (http/https).")

    const beschreibung = String(req.body?.beschreibung ?? "").trim()
    if (!beschreibung) throw new ApiError(400, "Bitte beschreibe kurz, was die Quelle liefert.")
    if (beschreibung.length > MAX_BESCHREIBUNG) {
      throw new ApiError(400, `Beschreibung zu lang (max. ${MAX_BESCHREIBUNG} Zeichen).`)
    }

    const { email, tenant } = req.ctx
    const { rows } = await db.query(
      `INSERT INTO source_requests (email, tenant_slug, url, beschreibung)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [email, tenant?.slug ?? null, url, beschreibung],
    )
    res.status(201).json(rowToSourceRequest(rows[0]))
  }))

  /** Liste + Status-Zähler — nur Admin. Optionaler ?status-Filter. */
  r.get("/", requireRole("admin"), asyncHandler(async (req, res) => {
    const filter = req.query.status
    const where = STATUS.has(filter) ? "WHERE status = $1" : ""
    const params = STATUS.has(filter) ? [filter] : []
    const { rows } = await db.query(
      `SELECT * FROM source_requests ${where} ORDER BY created_at DESC LIMIT 500`,
      params,
    )
    const { rows: counts } = await db.query(
      "SELECT status, count(*)::int AS n FROM source_requests GROUP BY status",
    )
    const zaehler = { offen: 0, in_arbeit: 0, erledigt: 0, verworfen: 0 }
    for (const c of counts) if (c.status in zaehler) zaehler[c.status] = c.n
    res.json({ requests: rows.map(rowToSourceRequest), zaehler })
  }))

  /** Status/Notiz pflegen — nur Admin. */
  r.patch("/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Vorschlag nicht gefunden")
    const statusGesetzt = req.body?.status !== undefined
    if (statusGesetzt && !STATUS.has(req.body.status)) throw new ApiError(400, "Ungültiger Status")
    const notizGesetzt = req.body?.notiz !== undefined
    if (!statusGesetzt && !notizGesetzt) throw new ApiError(400, "Nichts zu ändern")

    const status = statusGesetzt ? req.body.status : null
    const notiz =
      notizGesetzt && req.body.notiz !== null
        ? String(req.body.notiz).slice(0, MAX_BESCHREIBUNG)
        : null

    const { rows } = await db.query(
      `UPDATE source_requests SET
         status = COALESCE($2, status),
         resolved_at = CASE
           WHEN $2 IN ('erledigt', 'verworfen') THEN COALESCE(resolved_at, now())
           WHEN $2 IS NOT NULL THEN NULL
           ELSE resolved_at
         END,
         notiz = CASE WHEN $3::boolean THEN $4 ELSE notiz END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, notizGesetzt, notiz],
    )
    if (rows.length === 0) throw new ApiError(404, "Vorschlag nicht gefunden")
    res.json(rowToSourceRequest(rows[0]))
  }))

  /** Löschen — nur Admin. */
  r.delete("/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Vorschlag nicht gefunden")
    const result = await db.query("DELETE FROM source_requests WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Vorschlag nicht gefunden")
    res.status(204).end()
  }))

  return r
}
