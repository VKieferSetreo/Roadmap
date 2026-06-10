// Dashboard-Aggregat.

import { Router } from "express"
import { asyncHandler, toIso } from "../util.js"

export function statsRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const projekte = await db.query(
      "SELECT count(*)::int AS projekte, count(*) FILTER (WHERE status = 'fertig')::int AS fertig FROM projects",
    )
    const funde = await db.query(
      `SELECT count(*)::int AS funde,
              count(*) FILTER (WHERE severity = 'kritisch')::int AS kritisch,
              count(*) FILTER (WHERE severity = 'warnung')::int AS warnung,
              count(*) FILTER (WHERE severity = 'hinweis')::int AS hinweis
       FROM findings`,
    )
    const hindernisse = await db.query(
      `SELECT count(*) FILTER (WHERE aktiv)::int AS hindernisse,
              count(*) FILTER (WHERE aktiv AND demo)::int AS hindernisse_demo
       FROM obstacles`,
    )
    const letzte = await db.query(
      "SELECT max(finished_at) AS letzte FROM analysis_runs WHERE status = 'done'",
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
