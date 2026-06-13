// Sync-API für den "Alle Quellen aktualisieren"-Button (DB-Tab).
//
// Jeder eingeloggte Nutzer darf den Sync auslösen (Max 2026-06-13); der
// Single-Run-Lock in sync.js verhindert parallele Mehrfachläufe. Connector-Logs
// (können interne URLs/Details enthalten) gehen nur an Admins — normale Nutzer
// sehen Status + Zähler, nicht die Roh-Logs.

import { Router } from "express"
import { allConnectors, getConnector } from "../connectors/index.js"
import { rowToQuelle } from "../map.js"
import { activeSyncJob, getSyncJob, startSync } from "../sync.js"
import { ApiError, asyncHandler } from "../util.js"

/** Job-Sicht fürs FE; Roh-Logs UND Roh-Fehlertexte (interne URLs/Details) nur für Admins. */
function jobView(job, isAdmin) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    total: job.total,
    done: job.done,
    current: job.current,
    deaktiviertAbgelaufen: job.deaktiviertAbgelaufen,
    rerun: job.rerun,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: isAdmin ? job.error : job.error ? "Fehler beim Sync" : null,
    runs: job.runs.map((run) =>
      isAdmin
        ? run
        : { ...run, log: undefined, error: run.error ? "Quelle nicht erreichbar" : undefined },
    ),
  }
}

export function syncRouter({ db, fetchImpl = globalThis.fetch, env = process.env }) {
  const r = Router()

  /** Übersicht für die DB-Tab-Kopfzeile: Quellen-Status + zuletzt aktualisiert. */
  r.get("/status", asyncHandler(async (req, res) => {
    const { rows } = await db.query("SELECT * FROM quellen ORDER BY id ASC")
    const quellen = rows.map((row) => {
      const connector = getConnector(row.id)
      return {
        ...rowToQuelle(row),
        connector: connector != null,
        vollbestand: connector?.vollbestand === true,
      }
    })
    const letzteAbrufe = rows.map((x) => x.letzter_abruf).filter(Boolean)
    const zuletztAktualisiert = letzteAbrufe.length
      ? new Date(Math.max(...letzteAbrufe.map((d) => new Date(d).getTime()))).toISOString()
      : null
    const aktiv = activeSyncJob()
    res.json({
      quellen,
      connectorAnzahl: allConnectors().length,
      zuletztAktualisiert,
      activeJobId: aktiv ? aktiv.id : null,
    })
  }))

  /** Sync starten (oder den laufenden Job zurückgeben). */
  r.post("/", asyncHandler(async (req, res) => {
    const job = startSync({ db, fetchImpl, env })
    res.status(202).json(jobView(job, req.ctx?.isAdmin === true))
  }))

  /** Fortschritt eines Sync-Jobs pollen. */
  r.get("/:jobId", asyncHandler(async (req, res) => {
    const job = getSyncJob(req.params.jobId)
    if (!job) throw new ApiError(404, "Sync-Job nicht gefunden (evtl. abgelaufen)")
    res.json(jobView(job, req.ctx?.isAdmin === true))
  }))

  return r
}
