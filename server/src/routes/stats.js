// Dashboard-Aggregat — Projekte/Funde/letzte Analyse tenant-gescoped.
// Hindernisse (v3): sichtbarkeits-gescoped wie GET /api/obstacles —
// globale Einträge + Kunden-Einträge des eigenen Mandanten (kein Leak fremder Zahlen).

import { Router } from "express"
import { asyncHandler, toIso } from "../util.js"

export function statsRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const tenantId = req.ctx.tenant.id
    const email = req.ctx.email ?? ""
    // T-638: Dashboard-Zahlen respektieren dieselbe Sichtbarkeit wie die Projekt-Liste — geteilt
    // (owner NULL) + eigen-privat (owner = eigene E-Mail). Sonst zählt die Statistik private Projekte/
    // Funde fremder Nutzer mit (Info-Leak über die reine Zahl), auch für Admins.
    const VIS = "(owner_email IS NULL OR owner_email = $2)"
    const VIS_P = "(p.owner_email IS NULL OR p.owner_email = $2)"
    const projekte = await db.query(
      `SELECT count(*)::int AS projekte, count(*) FILTER (WHERE status = 'fertig')::int AS fertig FROM projects WHERE tenant_id = $1 AND ${VIS}`,
      [tenantId, email],
    )
    const funde = await db.query(
      `SELECT count(*)::int AS funde,
              count(*) FILTER (WHERE f.severity = 'kritisch')::int AS kritisch,
              count(*) FILTER (WHERE f.severity = 'warnung')::int AS warnung,
              count(*) FILTER (WHERE f.severity = 'hinweis')::int AS hinweis
       FROM findings f JOIN projects p ON p.id = f.project_id WHERE p.tenant_id = $1 AND ${VIS_P}`,
      [tenantId, email],
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
       WHERE r.status = 'done' AND p.tenant_id = $1 AND ${VIS_P}`,
      [tenantId, email],
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
