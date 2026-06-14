// Import-Engine: führt EINEN Connector-Run aus — Upsert über (quellen_id, externe_id),
// fachId-Vergabe für neue Einträge (geteilt mit der API, src/obstaclesRepo.js),
// Statistik + import_runs-Protokoll + quellen.letzter_abruf.
//
// Vollbestand-Connectoren (connector.vollbestand): nach dem Upsert werden Einträge
// dieser Quelle, die NICHT mehr im Feed sind, deaktiviert (Reconcile —
// abgebaute/abgesagte Baustellen verschwinden); im Feed wieder auftauchende
// Einträge werden reaktiviert.
//
// Fehler im Connector → Run status 'error' mit Log; runImport wirft NIE
// (der Worker und der Admin-Trigger laufen immer weiter).

import {
  assignFachId, insertObstacle, istReineInfrastruktur, sachfeldParams, todayIso,
  UPDATE_SACHFELDER_SQL, validateObstacle,
} from "../obstaclesRepo.js"

const EXISTING_SQL = "SELECT * FROM obstacles WHERE quellen_id = $1 AND externe_id = $2"

const REACTIVATE_SQL = "UPDATE obstacles SET aktiv = true, updated_at = now() WHERE id = $1"

// Fehlende Einträge der Quelle deaktivieren (nur Vollbestand-Feeds, nur was nicht
// mehr gesehen wurde). Manuelle Quelle 0100 ist nie betroffen (eigene quellen_id).
const RECONCILE_SQL = `UPDATE obstacles
     SET aktiv = false, updated_at = now()
   WHERE quellen_id = $1 AND aktiv = true AND externe_id IS NOT NULL
     AND externe_id <> ALL($2::text[])`

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

  const stats = {
    gefunden: 0, neu: 0, aktualisiert: 0, uebersprungen: 0, deaktiviert: 0, reaktiviert: 0,
  }
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
    // Kaputte/leere Connector-Antwort sichtbar machen (sonst sieht ein „ok, 0 gefunden"
    // wie ein legitim leerer Feed aus). Reconcile bleibt durch seen.size>0 geschützt.
    if (!Array.isArray(result?.obstacles)) {
      note("Connector lieferte kein obstacles-Array — als leerer Feed behandelt (kein Reconcile)")
    }
    stats.gefunden = items.length

    // EIN tx pro Run: fachId-Sequenz konsistent, halbfertige Runs rollen zurück.
    const seen = new Set()
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
        // Reine bestehende Infrastruktur ohne Abweichung gar nicht erst speichern (Standard = Engineering).
        if (istReineInfrastruktur(check.value)) {
          stats.uebersprungen += 1
          stats.infrastruktur = (stats.infrastruktur ?? 0) + 1
          continue
        }
        seen.add(externeId)
        const value = check.value
        value.quellenId = connector.quelleId
        value.tenantId = null // Importe sind IMMER global
        value.externeId = externeId
        value.demo = false

        const { rows: existing } = await q.query(EXISTING_SQL, [connector.quelleId, externeId])
        if (existing[0]) {
          // Sachfeld-Update — fachId/realerStart bleiben stabil
          await q.query(UPDATE_SACHFELDER_SQL, sachfeldParams(existing[0].id, value))
          stats.aktualisiert += 1
          // Vollbestand: wieder im Feed ⇒ reaktivieren (war's deaktiviert/abgelaufen)
          if (connector.vollbestand && existing[0].aktiv === false) {
            await q.query(REACTIVATE_SQL, [existing[0].id])
            stats.reaktiviert += 1
          }
        } else {
          value.realerStart = value.realerStart ?? todayIso()
          value.fachId = await assignFachId(q, {
            quellenId: connector.quelleId, realerStart: value.realerStart,
          })
          await insertObstacle(q, value)
          stats.neu += 1
        }
      }

      // Reconcile: bei Vollbestand-Feeds Fehlende deaktivieren. Nur wenn wir
      // tatsächlich etwas Gültiges gesehen haben (sonst würde ein leerer/kaputter
      // Feed fälschlich den ganzen Bestand deaktivieren).
      if (connector.vollbestand && seen.size > 0) {
        const { rowCount } = await q.query(RECONCILE_SQL, [connector.quelleId, [...seen]])
        stats.deaktiviert = rowCount
        if (rowCount > 0) note(`Reconcile: ${rowCount} nicht mehr im Feed → deaktiviert`)
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
