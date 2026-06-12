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
import { loadEnv } from "../env.js"
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
  } catch (err) {
    // runImport wirft eigentlich nie — letzte Verteidigungslinie, Worker läuft weiter
    log(`${connector.quelleId}: unerwarteter Fehler — ${err?.message ?? err}`)
  } finally {
    running.delete(connector.quelleId)
  }
}

function shutdown(signal) {
  log(`${signal} empfangen — stoppe Jobs und beende`)
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

  // Heartbeat hält den Event-Loop am Leben und macht den Worker im Log sichtbar
  jobs.push(new Cron("0 * * * *", () => log(`alive — ${jobs.length - 1} Connector-Job(s) geplant`)))
  log(`roadmap-worker bereit — ${connectors.length} Connector(en) aktiv`)

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
} catch (err) {
  log(`Start fehlgeschlagen: ${err?.message ?? err}`)
  await pool.end()
  process.exit(1)
}
