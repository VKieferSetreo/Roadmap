// Postgres-Zugriff. Die App spricht nur gegen das schmale { query, tx }-Interface,
// damit Tests ein Fake-db injizieren können (kein echtes Postgres nötig).

import pg from "pg"

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new pg.Pool({ connectionString, max: 10 })
}

/** Wickelt einen pg-Pool in das injectable db-Interface. */
export function createDb(pool) {
  return {
    query: (text, params) => pool.query(text, params),
    /** Transaktion auf einem dedizierten Client (BEGIN auf dem Pool wäre falsch). */
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const result = await fn({ query: (text, params) => client.query(text, params) })
        await client.query("COMMIT")
        return result
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      } finally {
        client.release()
      }
    },
  }
}

export function createDefaultDb() {
  return createDb(createPool())
}
