// Admin-Sicht auf ausgeblendete Funde (für /debug-Triage): tenant-übergreifend, nur Admin.
// Liefert den systematischen Verbesserungs-Loop — Zähler je Grund und je Quelle ("welche
// Quelle/Connector produziert die meisten Falsch-Funde"). Snapshot (kontext) statt Live-Join,
// damit die Info auch nach Löschen des Hindernisses erhalten bleibt.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { asyncHandler, toIso } from "../util.js"

export function hiddenFindingsRouter({ db }) {
  const r = Router()

  r.get("/", requireRole("admin"), asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT h.id, h.project_id, h.finding_key, h.obstacle_id, h.grund, h.grund_text,
              h.kontext, h.hidden_by, h.created_at, p.name AS projekt_name
       FROM hidden_findings h LEFT JOIN projects p ON p.id = h.project_id
       ORDER BY h.created_at DESC LIMIT 500`,
    )
    const grundZaehler = {}
    const quelleZaehler = {}
    const eintraege = rows.map((row) => {
      grundZaehler[row.grund] = (grundZaehler[row.grund] ?? 0) + 1
      const quelle = row.kontext?.quelleName ?? "—"
      quelleZaehler[quelle] = (quelleZaehler[quelle] ?? 0) + 1
      return {
        id: row.id,
        projektId: row.project_id,
        projektName: row.projekt_name ?? null,
        findingKey: row.finding_key,
        obstacleId: row.obstacle_id ?? null,
        grund: row.grund,
        grundText: row.grund_text ?? null,
        kontext: row.kontext ?? {},
        hiddenBy: row.hidden_by ?? null,
        createdAt: toIso(row.created_at),
      }
    })
    res.json({ eintraege, grundZaehler, quelleZaehler })
  }))

  return r
}
