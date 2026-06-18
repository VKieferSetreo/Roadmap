// Bug-Reports: In-App-Fehlermeldungen.
//   POST /api/bug-reports          — jeder eingeloggte Nutzer (kein Tenant-Zwang)
//   GET  /api/bug-reports          — nur Admin (Triage auf /debug)
//   PATCH/DELETE /api/bug-reports/:id — nur Admin (Status/Notiz pflegen, löschen)
//
// Meldender, aktiver Mandant und Admin-Flag kommen aus req.ctx (serverseitig,
// nicht fälschbar). Der Client liefert nur Beschreibung + Kontext-Snapshot.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { rowToBugReport } from "../map.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

const STATUS = new Set(["offen", "in_arbeit", "erledigt", "verworfen"])
const MAX_BESCHREIBUNG = 5000
const MAX_KONTEXT_BYTES = 64 * 1024 // 64 KB Kontext-Snapshot reichen reichlich

export function bugReportsRouter({ db }) {
  const r = Router()

  /** Melden — jeder eingeloggte Nutzer. */
  r.post("/", asyncHandler(async (req, res) => {
    const beschreibung = String(req.body?.beschreibung ?? "").trim()
    if (!beschreibung) throw new ApiError(400, "Bitte beschreibe kurz, was nicht passt.")
    if (beschreibung.length > MAX_BESCHREIBUNG) {
      throw new ApiError(400, `Beschreibung zu lang (max. ${MAX_BESCHREIBUNG} Zeichen).`)
    }

    const viewPath = req.body?.viewPath ? String(req.body.viewPath).slice(0, 500) : null

    let kontext = req.body?.kontext ?? {}
    if (typeof kontext !== "object" || Array.isArray(kontext) || kontext === null) kontext = {}
    if (JSON.stringify(kontext).length > MAX_KONTEXT_BYTES) {
      throw new ApiError(400, "Kontext-Daten zu groß.")
    }

    // Optionaler Seiten-Screenshot (data:image-JPEG, base64) — defensiv begrenzt.
    const rawShot = req.body?.screenshot
    const screenshot =
      typeof rawShot === "string" && /^data:image\//.test(rawShot) && rawShot.length <= 6_000_000
        ? rawShot
        : null

    const { email, isAdmin, tenant } = req.ctx
    const { rows } = await db.query(
      `INSERT INTO bug_reports (email, tenant_slug, is_admin, beschreibung, view_path, kontext, screenshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [email, tenant?.slug ?? null, Boolean(isAdmin), beschreibung, viewPath, JSON.stringify(kontext), screenshot],
    )
    res.status(201).json(rowToBugReport(rows[0]))
  }))

  /** Liste + Status-Zähler — nur Admin. Optionaler ?status-Filter. */
  r.get("/", requireRole("admin"), asyncHandler(async (req, res) => {
    const filter = req.query.status
    const where = STATUS.has(filter) ? "WHERE status = $1" : ""
    const params = STATUS.has(filter) ? [filter] : []
    const { rows } = await db.query(
      `SELECT * FROM bug_reports ${where} ORDER BY created_at DESC LIMIT 500`,
      params,
    )
    const { rows: counts } = await db.query(
      "SELECT status, count(*)::int AS n FROM bug_reports GROUP BY status",
    )
    const zaehler = { offen: 0, in_arbeit: 0, erledigt: 0, verworfen: 0 }
    for (const c of counts) if (c.status in zaehler) zaehler[c.status] = c.n
    res.json({ reports: rows.map(rowToBugReport), zaehler })
  }))

  /** Status/Notiz pflegen — nur Admin. Statisches SQL: status (oder NULL = unverändert)
   *  führt resolved_at automatisch mit; notizGesetzt steuert, ob notiz geschrieben wird
   *  (erlaubt auch Leeren auf NULL). */
  r.patch("/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Bug-Report nicht gefunden")

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
      `UPDATE bug_reports SET
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
    if (rows.length === 0) throw new ApiError(404, "Bug-Report nicht gefunden")
    res.json(rowToBugReport(rows[0]))
  }))

  /** Löschen — nur Admin. */
  r.delete("/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Bug-Report nicht gefunden")
    const result = await db.query("DELETE FROM bug_reports WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Bug-Report nicht gefunden")
    res.status(204).end()
  }))

  return r
}
