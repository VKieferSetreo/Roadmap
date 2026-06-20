// Import-Worker — eigener Prozess (zweite Coolify-App, gleiche Codebase/DB).
// Plant die per env CONNECTORS (CSV der quelleIds) aktivierten Connectoren nach
// deren Cron (croner). KEINE Migration on-boot (macht die API) — der Worker wartet
// via simplem Retry, bis das Schema (quellen-Tabelle) da ist.
//
// CONNECTORS leer/ungesetzt → Worker läuft, plant nichts, loggt das deutlich
// und sendet nur den stündlichen Heartbeat.

import { Cron } from "croner"
import { enabledConnectors } from "../connectors/index.js"
import { createSemaphore } from "../concurrency.js"
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

/** T-469: Worker-Heartbeat in die DB schreiben (fire-and-forget — ein DB-Blip darf nicht killen). */
async function beat() {
  try {
    await db.query("UPDATE worker_heartbeat SET last_beat = now() WHERE id = 1")
  } catch (err) {
    log(`Heartbeat-Write fehlgeschlagen (ignoriert): ${err?.message ?? err}`)
  }
}

// Crash-Netz (T-305/T-323): ein ungefangener Background-Reject (z.B. pool.connect()
// rejected bei Pool-Erschöpfung am 8/12/18-Tick, oder ein unlock-Query auf toter
// Connection) darf den EINZIGEN Worker nicht killen — sonst Crash-Loop genau dann,
// wenn Importe am wichtigsten sind. Loggen statt sterben.
// ponytail: bewusster Weiterlauf auch bei uncaughtException — die realen Pfade sind
// gewickelt, das hier ist nur das Sicherheitsnetz gegen einen künftigen Stray-Reject.
process.on("unhandledRejection", (reason) =>
  log(`unhandledRejection (ignoriert): ${reason?.stack ?? reason}`),
)
process.on("uncaughtException", (err) => log(`uncaughtException (ignoriert): ${err?.stack ?? err}`))

// T-303: 45 Connectoren teilen sich den 8/12/18-Tick. Jeder Run hält 2 Pool-Connections
// (Lock-Client + tx-Client) gegen pool max=10 → ohne Drossel sterben ~40 Runs am
// connectionTimeout. Der Semaphore lässt nie mehr Runs gleichzeitig connecten als der Pool
// fasst (4×2=8 ≤ 10); die übrigen warten FIFO, OHNE eine Connection zu belegen.
const IMPORT_CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY ?? 4)
const runConnectorGated = createSemaphore(IMPORT_CONCURRENCY)

// Croner-Optionen für ALLE Jobs:
//  protect  — überlappende Trigger überspringen, BEVOR eine Connection geholt wird (T-364)
//  timezone — "0 8,12,18" soll Berlin-Wandzeit sein, nicht UTC. Als Option statt Container-TZ,
//             damit der app-weite TZ=UTC-Pin (T-465) nicht kollidiert (T-365)
//  catch    — ein geworfener/rejecteter Lauf wird geloggt, nie unhandled (T-305)
const CRON_OPTS = {
  protect: true,
  timezone: "Europe/Berlin",
  catch: (err) => log(`Cron-Job-Fehler (gefangen): ${err?.stack ?? err}`),
}

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

// Prozessübergreifender Lock pro Connector (pg-Advisory-Lock auf dediziertem Client).
// Ersetzt die frühere In-Memory-Set: verhindert Doppel-Runs NICHT nur im selben Prozess,
// sondern über mehrere Worker-Instanzen hinweg. Cron-Duplikation (2 Worker feuern denselben
// Cron) wird damit harmlos — nur einer bekommt den Lock, der andere überspringt. Bei einem
// Worker ist das Verhalten identisch (Lock immer frei). Muster wie engine/rerunAll.js.
const LOCK_NS = "roadmap_connector:"

async function withConnectorLock(connector, fn) {
  // pool.connect() IN den try ziehen: rejectet er bei Pool-Erschöpfung/DB-down, wird der
  // Lauf übersprungen statt der Reject aus execute() heraus zu propagieren (T-305).
  let client
  try {
    client = await pool.connect()
  } catch (err) {
    log(`${connector.quelleId} (${connector.name}): keine DB-Connection — übersprungen: ${err?.message ?? err}`)
    return
  }
  const key = LOCK_NS + connector.quelleId
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [key])
    if (!rows[0]?.ok) {
      log(`${connector.quelleId} (${connector.name}): läuft bereits (anderer Worker/Run) — übersprungen`)
      return
    }
    try {
      await fn()
    } finally {
      // Unlock darf nie werfen: stirbt die Connection mitten im Run (DB-Restart/Netz-Blip,
      // serverseitiger statement_timeout-Kill), fällt der Advisory-Lock ohnehin mit der
      // Session weg — also nur loggen, nicht propagieren (T-323).
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key])
      } catch (err) {
        log(`${connector.quelleId}: unlock fehlgeschlagen (Lock fällt mit Session) — ${err?.message ?? err}`)
      }
    }
  } catch (err) {
    log(`${connector.quelleId}: Lock-/Lauf-Fehler — übersprungen: ${err?.message ?? err}`)
  } finally {
    client.release()
  }
}

async function execute(connector) {
  // Semaphore-gated: nie mehr gleichzeitige Runs als der Pool Connections fasst (T-303).
  await runConnectorGated(() =>
    withConnectorLock(connector, async () => {
      log(`${connector.quelleId} (${connector.name}): Run startet`)
      try {
        const run = await runImport({ db, connector, log: (m) => log(m) })
        log(`${connector.quelleId}: Run ${run.status} — ${JSON.stringify(run.stats)}`)
        if (run.status === "ok" && changed(run.stats)) scheduleRerun()
      } catch (err) {
        // runImport wirft eigentlich nie — letzte Verteidigungslinie, Worker läuft weiter
        log(`${connector.quelleId}: unerwarteter Fehler — ${err?.message ?? err}`)
      }
    }),
  )
}

function shutdown(signal) {
  log(`${signal} empfangen — stoppe Jobs und beende`)
  if (rerunTimer) clearTimeout(rerunTimer)
  for (const job of jobs) job.stop()
  pool.end().finally(() => process.exit(0))
}

try {
  await waitForSchema()

  // T-467: globaler Orphan-Sweep beim Boot. Ein harter Crash (SIGKILL/OOM) hinterlässt
  // 'running'-Waisen in analysis_runs, die der per-Projekt-Reclaim in runAnalysis nur LAZY
  // beim nächsten Lauf DESSELBEN Projekts heilt — ein nie wieder ausgewertetes Projekt bliebe
  // blockiert. Der Boot ist genau der Moment nach so einem Crash → projektübergreifend freigeben.
  await db
    .query(
      "UPDATE analysis_runs SET status = 'error', error = 'stale (boot sweep)', finished_at = now() " +
        "WHERE status = 'running' AND started_at < now() - interval '15 minutes'",
    )
    .then((r) => r.rowCount > 0 && log(`Orphan-Sweep: ${r.rowCount} verwaiste Analyse-Läufe freigegeben`))
    .catch((err) => log(`Orphan-Sweep fehlgeschlagen (ignoriert): ${err?.message ?? err}`))

  const connectors = enabledConnectors(process.env)
  if (connectors.length === 0) {
    log("CONNECTORS leer — keine Connectoren geplant, Worker läuft im Leerlauf (nur Heartbeat)")
  }
  for (const connector of connectors) {
    jobs.push(new Cron(connector.schedule, CRON_OPTS, () => execute(connector)))
    log(`geplant: ${connector.quelleId} (${connector.name}) → "${connector.schedule}"`)
  }

  // Täglicher Hygiene-Cleanup (abgelaufene Hindernisse) + Re-Auswertung —
  // unabhängig davon, ob Importe liefen (gueltig_bis läuft auch ohne Feed ab).
  jobs.push(new Cron("30 3 * * *", CRON_OPTS, () => void runRerun("täglicher Cleanup")))

  // Heartbeat (T-469): hält den Event-Loop am Leben, macht den Worker im Log sichtbar UND
  // schreibt einen DB-Heartbeat, den /api/health auf Staleness prüft (Dead-Man's-Switch).
  // 5-Min-Takt, damit der >2h-Schwellwert sinnvoll greift. DB-Write fire-and-forget — ein
  // DB-Blip darf den Worker nicht killen.
  jobs.push(new Cron("*/5 * * * *", CRON_OPTS, () => {
    log(`alive — ${jobs.length - 2} Connector-Job(s) geplant`)
    void beat()
  }))
  await beat() // Boot-Beat sofort, damit der Status nicht 5 Min „stale" startet
  log(`roadmap-worker bereit — ${connectors.length} Connector(en) aktiv`)

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
} catch (err) {
  log(`Start fehlgeschlagen: ${err?.message ?? err}`)
  await pool.end()
  process.exit(1)
}
