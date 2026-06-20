// Simpler SQL-Migrations-Runner: migrations/*.sql sortiert, _migrations-Tabelle,
// jede Migration transaktional, mehrfach aufrufbar (idempotent).
//
// T-328: Session-Advisory-Lock um die GANZE Schleife → bei Coolify-Rolling-Deploy (zwei
//   API-Container) oder parallelem `npm run migrate` läuft NUR einer; der zweite blockiert,
//   sieht danach alle Files als done → kein Doppel-Apply nicht-idempotenter DDL.
// T-306: Checksum je Migration (Drift sichtbar, aber kein Re-Apply/Brick) + entschärfter
//   Fehlerpfad (defensiver ROLLBACK, klare Operatormeldung) statt stillem Boot-Brick.

import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"

loadEnv()

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url))
const MIGRATE_LOCK_KEY = 4711423001 // fester bigint, getrennt vom RERUN_LOCK_KEY-hashtext-Raum
const pool = createPool()

// Dedizierte Session-Connection für den Advisory-Lock (über die gesamte Schleife = mehrere Tx).
const lockClient = await pool.connect()
try {
  await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATE_LOCK_KEY])

  // _migrations: name + checksum (T-306). DEFAULT '' backfillt Bestandszeilen → nie fälschlich
  // als Drift gemeldet; ADD COLUMN IF NOT EXISTS macht es auf Alt-DBs idempotent.
  await pool.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, checksum text NOT NULL DEFAULT '', applied_at timestamptz NOT NULL DEFAULT now())",
  )
  await pool.query("ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum text NOT NULL DEFAULT ''")

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8")
    const sum = createHash("sha256").update(sql).digest("hex")

    const done = await pool.query("SELECT checksum FROM _migrations WHERE name = $1", [file])
    if (done.rowCount > 0) {
      const stored = done.rows[0].checksum
      // Drift nur melden (nicht crashen, nicht re-applien): bereits applizierte Migration wurde
      // nachträglich editiert. Bestandszeilen (stored='') triggern das bewusst nie.
      if (stored && stored !== sum) {
        console.warn(`DRIFT  ${file}: nach Apply geändert (db=${stored.slice(0, 12)}… file=${sum.slice(0, 12)}…) — wird NICHT erneut ausgeführt`)
      }
      console.log(`skip   ${file}`)
      continue
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("INSERT INTO _migrations (name, checksum) VALUES ($1, $2)", [file, sum])
      await client.query("COMMIT")
      console.log(`applied ${file}`)
    } catch (err) {
      // ROLLBACK defensiv: auf toter Connection kann er selbst rejecten → nicht unhandled werfen.
      try { await client.query("ROLLBACK") } catch { /* Connection tot — Tx fällt ohnehin */ }
      console.error(
        `\nMIGRATION FEHLGESCHLAGEN: ${file}\n${err?.message ?? err}\n` +
          `Kein Schema-Schaden (zurückgerollt, nicht eingetragen). Migration korrigieren und neu deployen.\n`,
      )
      // Bewusst harter Exit: kein API-Start mit halbem Schema. Aber mit Diagnose statt stillem Brick.
      process.exit(1)
    } finally {
      client.release()
    }
  }
  console.log("migrations up to date")
} finally {
  try { await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATE_LOCK_KEY]) } catch { /* Lock fällt mit Session */ }
  lockClient.release()
  await pool.end()
}
