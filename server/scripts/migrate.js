// Simpler SQL-Migrations-Runner: migrations/*.sql sortiert, _migrations-Tabelle,
// jede Migration transaktional, mehrfach aufrufbar (idempotent).

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"

loadEnv()

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url))
const pool = createPool()

try {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  )
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()

  for (const file of files) {
    const done = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file])
    if (done.rowCount > 0) {
      console.log(`skip   ${file}`)
      continue
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file])
      await client.query("COMMIT")
      console.log(`applied ${file}`)
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  }
  console.log("migrations up to date")
} finally {
  await pool.end()
}
