// News-Feed: Liste (jeder eingeloggte Nutzer) + Anlegen/Loeschen (nur Setreo-Admin).
// Gelesen-Status hält das FE lokal (localStorage) — kein Backend-Read-Tracking.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

const KATEGORIEN = ["datenquelle", "version", "hinweis"]

function rowToNews(r) {
  return {
    id: r.id,
    kategorie: r.kategorie,
    titel: r.titel,
    body: r.body ?? "",
    createdBy: r.created_by ?? null,
    publishedAt: r.published_at,
  }
}

export function newsRouter({ db }) {
  const r = Router()

  /** Liste — jeder eingeloggte Nutzer (neueste zuerst). */
  r.get("/", asyncHandler(async (req, res) => {
    const { rows } = await db.query("SELECT * FROM news ORDER BY published_at DESC LIMIT 50")
    res.json({ news: rows.map(rowToNews) })
  }))

  /** Anlegen — nur Setreo-Admin. */
  r.post("/", requireRole("admin"), asyncHandler(async (req, res) => {
    const kategorie = KATEGORIEN.includes(req.body?.kategorie) ? req.body.kategorie : "hinweis"
    const titel = typeof req.body?.titel === "string" ? req.body.titel.trim() : ""
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : ""
    if (!titel) throw new ApiError(400, "titel erforderlich")
    const { rows } = await db.query(
      "INSERT INTO news (kategorie, titel, body, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [kategorie, titel, body, req.ctx?.email ?? null],
    )
    res.status(201).json(rowToNews(rows[0]))
  }))

  /** Loeschen — nur Setreo-Admin. */
  r.delete("/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Nicht gefunden")
    const result = await db.query("DELETE FROM news WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Nicht gefunden")
    res.status(204).end()
  }))

  return r
}
