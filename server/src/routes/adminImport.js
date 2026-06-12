// Admin-Sicht auf die Import-Engine: Protokoll der letzten Runs + Quellen-Status,
// manueller synchroner Trigger eines Connectors (auch wenn nicht via env aktiviert).

import { Router } from "express"
import { requireRole } from "../auth.js"
import { getConnector } from "../connectors/index.js"
import { rowToImportRun, rowToQuelle } from "../map.js"
import { runImport } from "../worker/importer.js"
import { ApiError, asyncHandler } from "../util.js"

export function adminImportRouter({ db, fetchImpl = globalThis.fetch, env = process.env }) {
  const r = Router()
  const guard = requireRole("admin")

  /** Letzte 50 Runs + Quellen-Register (connector: ist ein Connector registriert?). */
  r.get("/import-runs", guard, asyncHandler(async (req, res) => {
    const runs = await db.query("SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 50")
    const quellen = await db.query("SELECT * FROM quellen ORDER BY id ASC")
    res.json({
      runs: runs.rows.map(rowToImportRun),
      quellen: quellen.rows.map((row) => ({
        ...rowToQuelle(row),
        connector: getConnector(row.id) != null,
      })),
    })
  }))

  /** Connector synchron ausführen → Run-Summary. 404 wenn kein Connector registriert. */
  r.post("/import/:quelleId", guard, asyncHandler(async (req, res) => {
    const connector = getConnector(req.params.quelleId)
    if (!connector) {
      throw new ApiError(404, `Kein Connector für Quelle ${req.params.quelleId} registriert`)
    }
    const run = await runImport({ db, connector, fetchImpl, env })
    res.json(rowToImportRun(run))
  }))

  return r
}
