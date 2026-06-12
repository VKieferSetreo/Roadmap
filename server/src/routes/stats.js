// Dashboard-Aggregat — Projekte/Funde/letzte Analyse tenant-gescoped.
// Hindernisse (v3): sichtbarkeits-gescoped wie GET /api/obstacles —
// globale Einträge + Kunden-Einträge des eigenen Mandanten (kein Leak fremder Zahlen).

import { Router } from "express"
import { asyncHandler, toIso } from "../util.js"

export function statsRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const tenantId = req.ctx.tenant.id
    const projekte = await db.query(
      "SELECT count(*)::int AS projekte, count(*) FILTER (WHERE status = 'fertig')::int AS fertig FROM projects WHERE tenant_id = $1",
      [tenantId],
    )
    const funde = await db.query(
      `SELECT count(*)::int AS funde,
              count(*) FILTER (WHERE f.severity = 'kritisch')::int AS kritisch,
              count(*) FILTER (WHERE f.severity = 'warnung')::int AS warnung,
              count(*) FILTER (WHERE f.severity = 'hinweis')::int AS hinweis
       FROM findings f JOIN projects p ON p.id = f.project_id WHERE p.tenant_id = $1`,
      [tenantId],
    )
    const hindernisse = await db.query(
      `SELECT count(*) FILTER (WHERE aktiv)::int AS hindernisse,
              count(*) FILTER (WHERE aktiv AND demo)::int AS hindernisse_demo
       FROM obstacles WHERE tenant_id IS NULL OR tenant_id = $1`,
      [tenantId],
    )
    const letzte = await db.query(
      `SELECT max(r.finished_at) AS letzte FROM analysis_runs r
       JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'done' AND p.tenant_id = $1`,
      [tenantId],
    )
    res.json({
      projekte: projekte.rows[0].projekte,
      fertig: projekte.rows[0].fertig,
      funde: funde.rows[0].funde,
      kritisch: funde.rows[0].kritisch,
      warnung: funde.rows[0].warnung,
      hinweis: funde.rows[0].hinweis,
      hindernisse: hindernisse.rows[0].hindernisse,
      hindernisseDemo: hindernisse.rows[0].hindernisse_demo,
      letzteAnalyse: toIso(letzte.rows[0].letzte) ?? null,
    })
  }))

  return r
}
