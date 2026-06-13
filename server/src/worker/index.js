// Import-Worker — eigener Prozess (zweite Coolify-App, gleiche Codebase/DB).
// Plant die per env CONNECTORS (CSV der quelleIds) aktivierten Connectoren nach
// deren Cron (croner). KEINE Migration on-boot (macht die API) — der Worker wartet
// via simplem Retry, bis das Schema (quellen-Tabelle) da ist.
//
// CONNECTORS leer/ungesetzt → Worker läuft, plant nichts, loggt das deutlich
// und sendet nur den stündlichen Heartbeat.

import { Cron } from "croner"
import { enabledConnectors } from "../connectors/index.js"
import { createDb, createPool } from "../db.js"
import { rerunAffectedProjects } from "../engine/rerunAll.js"
import { loadEnv } from "../env.js"
import { withTimeout } from "../util.js"
import { expireObstacles } from "./hygiene.js"
import { runImport } from "./importer.js"

loadEnv()

const log = (msg) => console.log(`[worker ${new Date().toISOString()}] ${msg}`)

const pool = createPool()
const db = createDb(pool)

/** Schema-Wait: API migriert on-boot — wir pollen bis die quellen-Tabelle existiert. */
async function waitForSchema({ tries = 120, delayMs = 5000 } = {}) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      await db.query("SELECT id FROM quellen LIMIT 1")
      return
    } catch (err) {
      log(`Schema noch nicht bereit (Versuch ${i}/${tries}): ${err.message}`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error("Schema nach Wartezeit nicht verfügbar — Abbruch (Restart via Orchestrator)")
}

const jobs = []
const running = new Set()
let rerunTimer = null
let rerunning = false

const RERUN_DEBOUNCE_MS = 60_000
// Sicherheitsventil: hängt der Rerun (DB-Deadlock o.ä.), wird der Lock nach
// dieser Zeit freigegeben, statt den Worker dauerhaft zu verklemmen.
const RERUN_TIMEOUT_MS = 5 * 60_000

/** Hat ein Import-Run den Datenbestand verändert? */
function changed(stats) {
  if (!stats) return false
  return ((stats.neu ?? 0) + (stats.aktualisiert ?? 0) +
    (stats.deaktiviert ?? 0) + (stats.reaktiviert ?? 0)) > 0
}

/** Mehrere Import-Änderungen kurz hintereinander zu EINEM Rerun bündeln. */
function scheduleRerun() {
  if (rerunTimer) clearTimeout(rerunTimer)
  rerunTimer = setTimeout(() => void runRerun("Import-Änderungen"), RERUN_DEBOUNCE_MS)
}

/** Abgelaufene deaktivieren + alle Projekte neu auswerten + Benachrichtigungen. */
async function runRerun(grund) {
  if (rerunning) {
    scheduleRerun() // läuft noch → gleich nochmal anstoßen
    return
  }
  rerunning = true
  rerunTimer = null
  try {
    const expired = await expireObstacles(db)
    if (expired.length) log(`Hygiene: ${expired.length} abgelaufene Hindernisse deaktiviert`)
    const res = await withTimeout(
      rerunAffectedProjects({ db, log: (m) => log(m) }), RERUN_TIMEOUT_MS, "Auto-Rerun",
    )
    log(`Auto-Rerun (${grund}): ${JSON.stringify(res)}`)
  } catch (err) {
    log(`Auto-Rerun fehlgeschlagen: ${err?.message ?? err}`)
  } finally {
    rerunning = false
  }
}

async function execute(connector) {
  if (running.has(connector.quelleId)) {
    log(`${connector.quelleId} (${connector.name}): vorheriger Run läuft noch — übersprungen`)
    return
  }
  running.add(connector.quelleId)
  log(`${connector.quelleId} (${connector.name}): Run startet`)
  try {
    const run = await runImport({ db, connector, log: (m) => log(m) })
    log(`${connector.quelleId}: Run ${run.status} — ${JSON.stringify(run.stats)}`)
    if (run.status === "ok" && changed(run.stats)) scheduleRerun()
  } catch (err) {
    // runImport wirft eigentlich nie — letzte Verteidigungslinie, Worker läuft weiter
    log(`${connector.quelleId}: unerwarteter Fehler — ${err?.message ?? err}`)
  } finally {
    running.delete(connector.quelleId)
  }
}

function shutdown(signal) {
  log(`${signal} empfangen — stoppe Jobs und beende`)
  if (rerunTimer) clearTimeout(rerunTimer)
  for (const job of jobs) job.stop()
  pool.end().finally(() => process.exit(0))
}

try {
  await waitForSchema()

  const connectors = enabledConnectors(process.env)
  if (connectors.length === 0) {
    log("CONNECTORS leer — keine Connectoren geplant, Worker läuft im Leerlauf (nur Heartbeat)")
  }
  for (const connector of connectors) {
    jobs.push(new Cron(connector.schedule, () => execute(connector)))
    log(`geplant: ${connector.quelleId} (${connector.name}) → "${connector.schedule}"`)
  }

  // Täglicher Hygiene-Cleanup (abgelaufene Hindernisse) + Re-Auswertung —
  // unabhängig davon, ob Importe liefen (gueltig_bis läuft auch ohne Feed ab).
  jobs.push(new Cron("30 3 * * *", () => void runRerun("täglicher Cleanup")))

  // Heartbeat hält den Event-Loop am Leben und macht den Worker im Log sichtbar
  jobs.push(new Cron("0 * * * *", () => log(`alive — ${jobs.length - 2} Connector-Job(s) geplant`)))
  log(`roadmap-worker bereit — ${connectors.length} Connector(en) aktiv`)

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
} catch (err) {
  log(`Start fehlgeschlagen: ${err?.message ?? err}`)
  await pool.end()
  process.exit(1)
}
