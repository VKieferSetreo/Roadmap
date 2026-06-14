// Sync-Orchestrator für den "Alle Quellen aktualisieren"-Button im FE.
//
// Ein Sync-Lauf: alle registrierten Connectoren nacheinander ziehen → abgelaufene
// Hindernisse deaktivieren (Hygiene) → alle ausgewerteten Projekte neu auswerten
// und Benachrichtigungen erzeugen. Läuft asynchron im Hintergrund; der Fortschritt
// wird in einer In-Memory-Job-Map gehalten, die das FE pollt (GET /api/sync/:id).
//
// Single-Run-Lock: läuft schon ein Sync, liefert startSync den laufenden Job zurück
// (kein paralleler Mehrfachlauf, egal wie viele Nutzer gleichzeitig klicken).
//
// In-Memory: roadmap-api läuft als eine Instanz. Bei Neustart mitten im Lauf geht
// der Job-Status verloren (der Import selbst ist transaktional und unkritisch).

import { randomUUID } from "node:crypto"
import { enabledConnectors } from "./connectors/index.js"
import { rerunAffectedProjects } from "./engine/rerunAll.js"
import { rowToImportRun } from "./map.js"
import { withTimeout } from "./util.js"
import { expireObstacles } from "./worker/hygiene.js"
import { runImport } from "./worker/importer.js"

/** @type {Map<string, object>} jobId → Job-Status */
const jobs = new Map()
let activeJobId = null

const PRUNE_AFTER_MS = 60 * 60 * 1000 // fertige Jobs 1 h vorhalten, dann verwerfen
const RERUN_TIMEOUT_MS = 5 * 60 * 1000 // Rerun darf den Single-Run-Lock nicht ewig halten

function pruneJobs() {
  const cutoff = Date.now() - PRUNE_AFTER_MS
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.finishedAt && Date.parse(job.finishedAt) < cutoff) {
      jobs.delete(id)
    }
  }
}

export function getSyncJob(id) {
  return jobs.get(id) ?? null
}

export function activeSyncJob() {
  return activeJobId ? (jobs.get(activeJobId) ?? null) : null
}

/**
 * Startet einen Sync-Lauf (oder gibt den laufenden zurück). Returnt den Job sofort;
 * die Arbeit läuft im Hintergrund weiter.
 */
export function startSync({ db, fetchImpl = globalThis.fetch, env = process.env }) {
  pruneJobs()
  const running = activeSyncJob()
  if (running && running.status === "running") return running

  const connectors = enabledConnectors(env)
  const id = randomUUID()
  const job = {
    id,
    status: "running",
    phase: "import", // import | hygiene | rerun
    total: connectors.length,
    done: 0,
    current: connectors[0] ? { quelleId: connectors[0].quelleId, name: connectors[0].name } : null,
    runs: [],
    deaktiviertAbgelaufen: 0,
    rerun: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    etaSeconds: null, // geschätzte Restdauer (aus letzten Laufzeiten je Quelle)
  }
  jobs.set(id, job)
  activeJobId = id

  void runJob(job, { db, fetchImpl, env, connectors })
  return job
}

/** Letzte erfolgreiche Laufzeit je Quelle (Sekunden) aus import_runs → realistische ETA.
 *  So dominiert die langsame Quelle (Overpass ~15 min) die Schätzung korrekt, statt naivem elapsed/done. */
async function fetchConnectorDurations(db) {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT ON (quelle_id) quelle_id, EXTRACT(EPOCH FROM (finished_at - started_at)) AS dur
         FROM import_runs WHERE finished_at IS NOT NULL AND status = 'ok'
         ORDER BY quelle_id, started_at DESC`,
    )
    const m = new Map()
    for (const r of rows) {
      const d = Number(r.dur)
      if (Number.isFinite(d) && d >= 0) m.set(r.quelle_id, d)
    }
    return m
  } catch {
    return new Map()
  }
}

async function runJob(job, { db, fetchImpl, env, connectors }) {
  try {
    const durMap = await fetchConnectorDurations(db)
    const expected = (c) => durMap.get(c.quelleId) ?? 8 // unbekannt → 8 s Default
    const restDauer = () => Math.round(connectors.slice(job.done).reduce((s, c) => s + expected(c), 0))
    job.etaSeconds = restDauer()
    for (const connector of connectors) {
      job.current = { quelleId: connector.quelleId, name: connector.name }
      job.etaSeconds = restDauer() // inkl. aktueller Quelle
      try {
        const run = await runImport({ db, connector, fetchImpl, env })
        job.runs.push(rowToImportRun(run))
      } catch (err) {
        job.runs.push({
          quelleId: connector.quelleId, status: "error",
          error: String(err?.message ?? err), stats: {},
        })
      }
      job.done += 1
      job.etaSeconds = restDauer()
    }
    job.current = null
    job.etaSeconds = 0

    // Abgelaufene Hindernisse (7 Tage nach gueltig_bis) deaktivieren
    job.phase = "hygiene"
    try {
      const expired = await expireObstacles(db)
      job.deaktiviertAbgelaufen = expired.length
    } catch (err) {
      job.deaktiviertAbgelaufen = 0
      job.runs.push({ quelleId: "hygiene", status: "error", error: String(err?.message ?? err) })
    }

    // Alle ausgewerteten Projekte neu fahren + Benachrichtigungen erzeugen
    job.phase = "rerun"
    job.rerun = await withTimeout(rerunAffectedProjects({ db }), RERUN_TIMEOUT_MS, "Sync-Rerun")

    job.status = "done"
  } catch (err) {
    job.status = "error"
    job.error = String(err?.message ?? err)
  } finally {
    job.finishedAt = new Date().toISOString()
    if (activeJobId === job.id) activeJobId = null
  }
}
