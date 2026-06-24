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
import { initSentry, captureException } from "../sentry.js"
import { mailEnabled, sendMail } from "../mail/mailer.js"
import { expireObstacles, pruneAnalytics, pruneBugReportScreenshots, pruneImportRuns, purgeStaleInactive, reconcileFachIdDupes } from "./hygiene.js"
import { runImport } from "./importer.js"

loadEnv()
initSentry("worker") // T-468/469: GlitchTip-Error-Tracking (no-op ohne SENTRY_DSN)

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

// T-347: proaktive Lizenz-Ablauf-Erinnerung. Einmal je Ablaufzyklus (Marke renewal_notified_for)
// an die Tenant-Admins, sobald valid_until in ≤30 Tagen liegt. Ausgesetzte Mandanten ausgenommen.
// No-op ohne Mailjet (DB-neutral). ponytail: ein Reminder (30 Tage); Eskalation 14/7/1 bei Bedarf.
async function runLicenseReminders() {
  if (!mailEnabled(process.env)) return
  const base = (process.env.PUBLIC_ROADMAP_URL || "https://setreo-cloud.com/roadmap").replace(/\/$/, "")
  const { rows } = await db.query(
    `SELECT id, slug, name, valid_until FROM tenants
       WHERE valid_until IS NOT NULL AND suspended_at IS NULL
         AND valid_until >= current_date
         AND valid_until <= current_date + interval '30 days'
         AND renewal_notified_for IS DISTINCT FROM valid_until`,
  )
  for (const t of rows) {
    const admins = await db.query(
      "SELECT email FROM tenant_members WHERE tenant_id = $1 AND role = 'admin'",
      [t.id],
    )
    const recipients = admins.rows.map((a) => ({ email: a.email })).filter((r) => r.email)
    if (recipients.length === 0) continue // kein Admin → später erneut versuchen, Marke NICHT setzen
    const tage = Math.max(0, Math.ceil((new Date(t.valid_until).getTime() - Date.now()) / 86_400_000))
    const datum = String(t.valid_until).slice(0, 10).split("-").reverse().join(".")
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="background:#527121;padding:18px 22px;color:#fff;font-size:18px;font-weight:700">Setreo Roadmap — Lizenz läuft bald ab</div>
      <div style="padding:20px 22px;color:#1f2937;font-size:14px;line-height:1.55">
        <p>Ihre Setreo-Roadmap-Lizenz läuft in <strong>${tage} Tag${tage === 1 ? "" : "en"}</strong> ab (am ${datum}).</p>
        <p>Damit Ihr Zugang und Ihre Auswertungen ohne Unterbrechung weiterlaufen, verlängern Sie bitte rechtzeitig — Ihr Setreo-Ansprechpartner hilft Ihnen dabei.</p>
        <a href="${base}" style="display:inline-block;background:#527121;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px;margin-top:6px">Zur Plattform</a>
      </div>
      <div style="padding:14px 22px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:11px">Automatische Erinnerung von Setreo Roadmap — bitte nicht auf diese Adresse antworten.</div>
    </div>`
    const text = `Ihre Setreo-Roadmap-Lizenz läuft in ${tage} Tag(en) ab (am ${datum}). Bitte rechtzeitig verlängern — Ihr Setreo-Ansprechpartner hilft. Plattform: ${base}`
    try {
      await sendMail(
        { recipients, subject: `Lizenz läuft in ${tage} Tag${tage === 1 ? "" : "en"} ab`, html, text },
        { env: process.env, log },
      )
      await db.query("UPDATE tenants SET renewal_notified_for = $2 WHERE id = $1", [t.id, t.valid_until])
    } catch (err) {
      log(`Lizenz-Reminder für ${t.slug} fehlgeschlagen (ignoriert): ${err?.message ?? err}`)
      captureException(err instanceof Error ? err : new Error(String(err)), { kind: "license-reminder", tenant: t.slug })
    }
  }
}

// Crash-Netz (T-305/T-323): ein ungefangener Background-Reject (z.B. pool.connect()
// rejected bei Pool-Erschöpfung am 8/12/18-Tick, oder ein unlock-Query auf toter
// Connection) darf den EINZIGEN Worker nicht killen — sonst Crash-Loop genau dann,
// wenn Importe am wichtigsten sind. Loggen statt sterben.
// ponytail: bewusster Weiterlauf auch bei uncaughtException — die realen Pfade sind
// gewickelt, das hier ist nur das Sicherheitsnetz gegen einen künftigen Stray-Reject.
process.on("unhandledRejection", (reason) => {
  log(`unhandledRejection (ignoriert): ${reason?.stack ?? reason}`)
  captureException(reason instanceof Error ? reason : new Error(String(reason)), { kind: "unhandledRejection" })
})
process.on("uncaughtException", (err) => {
  log(`uncaughtException (ignoriert): ${err?.stack ?? err}`)
  captureException(err, { kind: "uncaughtException" })
})

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
async function waitForSchema({ tries = Number(process.env.WORKER_SCHEMA_WAIT_TRIES) || 120, delayMs = 5000 } = {}) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      // T-383: nicht nur quellen-Existenz prüfen, sondern die spätesten importer-relevanten
      // obstacles-Spalten (ki_aufbereitet, geom) — sonst startet der Importer bevor die Migration
      // durch ist und schreibt gegen ein halb-migriertes Schema.
      await db.query("SELECT ki_aufbereitet, geom FROM obstacles LIMIT 0")
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
let rerunDeadline = 0 // T-366: Obergrenze, ab der ein gebündelter Rerun spätestens losläuft

const RERUN_DEBOUNCE_MS = 60_000
// T-366: laufen Importe ununterbrochen, re-armt der Debounce den Rerun immer wieder neu — er
// liefe nie. Ab dem ERSTEN Trigger gilt diese Obergrenze, dann startet der Rerun garantiert.
const RERUN_MAX_WAIT_MS = 5 * 60_000
// Sicherheitsventil: hängt der Rerun (DB-Deadlock o.ä.), wird der Lock nach
// dieser Zeit freigegeben, statt den Worker dauerhaft zu verklemmen.
const RERUN_TIMEOUT_MS = 5 * 60_000

/** Hat ein Import-Run den Datenbestand verändert? */
function changed(stats) {
  if (!stats) return false
  return ((stats.neu ?? 0) + (stats.aktualisiert ?? 0) +
    (stats.deaktiviert ?? 0) + (stats.reaktiviert ?? 0)) > 0
}

/** Mehrere Import-Änderungen kurz hintereinander zu EINEM Rerun bündeln (mit Wartezeit-Cap T-366). */
function scheduleRerun() {
  if (rerunTimer) clearTimeout(rerunTimer)
  const now = Date.now()
  if (!rerunDeadline) rerunDeadline = now + RERUN_MAX_WAIT_MS // erster Trigger setzt die Obergrenze
  const delay = Math.max(0, Math.min(RERUN_DEBOUNCE_MS, rerunDeadline - now))
  rerunTimer = setTimeout(() => void runRerun("Import-Änderungen"), delay)
}

/** Abgelaufene deaktivieren + alle Projekte neu auswerten + Benachrichtigungen. */
async function runRerun(grund) {
  if (rerunning) {
    scheduleRerun() // läuft noch → gleich nochmal anstoßen
    return
  }
  rerunning = true
  rerunTimer = null
  rerunDeadline = 0 // T-366: Batch startet → Obergrenze für den nächsten Batch zurücksetzen
  try {
    const expired = await expireObstacles(db)
    if (expired.length) log(`Hygiene: ${expired.length} abgelaufene Hindernisse deaktiviert`)
    const purged = await purgeStaleInactive(db) // FIX-4: toten Ballast (lang-inaktive Importe) hart entfernen
    if (purged.length) log(`Hygiene: ${purged.length} lang-inaktive Importe endgültig gelöscht`)
    // T-262: fachId-Dubletten selbstheilen (sollte nach dem Präventions-Fix leer bleiben → Warnung wenn nicht).
    const deduped = await reconcileFachIdDupes(db, { log })
    if (deduped.renumbered) log(`Hygiene: fachId-Dedup ${deduped.groups} Gruppen / ${deduped.renumbered} Zeilen`)
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

// T-372: täglicher Retention-/Pruning-Lauf (eigener Cron, NICHT in den Rerun gemischt — Rerun
// läuft auch import-getrieben, Pruning soll nur 1×/Tag). Löscht alte import_runs (je Quelle bleibt
// der jüngste) + Analytics-Sessions/-Events älter als 365 Tage. Fire-and-forget, robust.
async function runPrune() {
  try {
    const ir = await pruneImportRuns(db)
    const an = await pruneAnalytics(db)
    const shots = await pruneBugReportScreenshots(db)
    log(`Retention: ${ir} import_runs, ${an.sessions} analytics_sessions, ${an.events} analytics_events, ${shots} bug-report-screenshots bereinigt`)
  } catch (err) {
    log(`Retention-Lauf fehlgeschlagen: ${err?.message ?? err}`)
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

  // T-408: gleicher Boot-Sweep für import_runs — ein harter Crash hinterlässt 'running'-Waisen, die
  // sonst dauerhaft als "Import läuft" erscheinen (Health/Staleness verfälscht).
  await db
    .query(
      "UPDATE import_runs SET status = 'error', finished_at = now() " +
        "WHERE status = 'running' AND started_at < now() - interval '15 minutes'",
    )
    .then((r) => r.rowCount > 0 && log(`Orphan-Sweep: ${r.rowCount} verwaiste Import-Läufe freigegeben`))
    .catch((err) => log(`Import-Orphan-Sweep fehlgeschlagen (ignoriert): ${err?.message ?? err}`))

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
  // T-347: tägliche Lizenz-Ablauf-Erinnerung (eigener Job, NICHT in den Rerun gemischt).
  jobs.push(new Cron("0 7 * * *", CRON_OPTS, () => void runLicenseReminders()))
  // T-372: tägliches Retention-/Pruning (import_runs + analytics) — eigener Job, früh morgens.
  jobs.push(new Cron("45 3 * * *", CRON_OPTS, () => void runPrune()))

  // Heartbeat (T-469): hält den Event-Loop am Leben, macht den Worker im Log sichtbar UND
  // schreibt einen DB-Heartbeat, den /api/health auf Staleness prüft (Dead-Man's-Switch).
  // 5-Min-Takt, damit der >2h-Schwellwert sinnvoll greift. DB-Write fire-and-forget — ein
  // DB-Blip darf den Worker nicht killen.
  jobs.push(new Cron("*/5 * * * *", CRON_OPTS, () => {
    log(`alive — ${jobs.length - 3} Connector-Job(s) geplant`)
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
