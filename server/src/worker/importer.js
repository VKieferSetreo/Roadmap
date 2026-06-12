// Import-Engine: führt EINEN Connector-Run aus — Upsert über (quellen_id, externe_id),
// fachId-Vergabe für neue Einträge (geteilt mit der API, src/obstaclesRepo.js),
// Statistik + import_runs-Protokoll + quellen.letzter_abruf.
//
// Fehler im Connector → Run status 'error' mit Log; runImport wirft NIE
// (der Worker und der Admin-Trigger laufen immer weiter).

import {
  assignFachId, insertObstacle, sachfeldParams, todayIso, UPDATE_SACHFELDER_SQL, validateObstacle,
} from "../obstaclesRepo.js"

const EXISTING_SQL = "SELECT * FROM obstacles WHERE quellen_id = $1 AND externe_id = $2"

/**
 * @returns import_runs-Row des abgeschlossenen Runs:
 *   { id, quelle_id, status: 'ok'|'error', stats, log, started_at, finished_at }
 */
export async function runImport({
  db, connector, fetchImpl = globalThis.fetch, env = process.env, log = console.log,
}) {
  const { rows: startRows } = await db.query(
    "INSERT INTO import_runs (quelle_id, status) VALUES ($1, 'running') RETURNING *",
    [connector.quelleId],
  )
  const run = startRows[0]

  const stats = { gefunden: 0, neu: 0, aktualisiert: 0, uebersprungen: 0 }
  const logLines = []
  const note = (msg) => {
    logLines.push(msg)
    log(`[import ${connector.quelleId}] ${msg}`)
  }
  let status = "ok"

  try {
    const timeoutMs = Number(env.EXTERNAL_TIMEOUT_MS ?? 4000)
    const result = await connector.fetch({ fetchImpl, env, timeoutMs, log: note })
    const items = Array.isArray(result?.obstacles) ? result.obstacles : []
    stats.gefunden = items.length

    // EIN tx pro Run: fachId-Sequenz konsistent, halbfertige Runs rollen zurück.
    await db.tx(async (q) => {
      for (const [index, item] of items.entries()) {
        const externeId =
          typeof item?.externeId === "string" && item.externeId.trim() ? item.externeId.trim() : null
        const check = validateObstacle(item)
        if (!externeId || !check.ok) {
          stats.uebersprungen += 1
          note(`Item ${index} übersprungen: ${!externeId ? "externeId fehlt" : check.reason}`)
          continue
        }
        const value = check.value
        value.quellenId = connector.quelleId
        value.tenantId = null // Importe sind IMMER global
        value.externeId = externeId
        value.demo = false

        const { rows: existing } = await q.query(EXISTING_SQL, [connector.quelleId, externeId])
        if (existing[0]) {
          // Sachfeld-Update — fachId/realerStart bleiben stabil, manuelles aktiv=false bleibt
          await q.query(UPDATE_SACHFELDER_SQL, sachfeldParams(existing[0].id, value))
          stats.aktualisiert += 1
        } else {
          value.realerStart = value.realerStart ?? todayIso()
          value.fachId = await assignFachId(q, {
            quellenId: connector.quelleId, realerStart: value.realerStart,
          })
          await insertObstacle(q, value)
          stats.neu += 1
        }
      }
    })
  } catch (err) {
    status = "error"
    note(`Fehler: ${err?.message ?? err}`)
  }

  const { rows: doneRows } = await db.query(
    `UPDATE import_runs SET status = $2, stats = $3, log = $4, finished_at = now()
     WHERE id = $1 RETURNING *`,
    [run.id, status, JSON.stringify(stats), logLines.length ? logLines.join("\n") : null],
  )
  await db.query("UPDATE quellen SET letzter_abruf = now() WHERE id = $1", [connector.quelleId])
  return doneRows[0]
}
