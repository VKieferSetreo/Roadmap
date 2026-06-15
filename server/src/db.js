// Postgres-Zugriff. Die App spricht nur gegen das schmale { query, tx }-Interface,
// damit Tests ein Fake-db injizieren können (kein echtes Postgres nötig).

import pg from "pg"

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Verwaiste/hängende Queries (z.B. Rerun-Schwer-SELECTs über riesige Bounding-Boxes)
    // killt Postgres nach 2 min selbst — withTimeout() lehnt nur die JS-Promise ab, die
    // SQL liefe sonst im Hintergrund weiter und stapelt sich bei jedem Sync, bis die DB kippt.
    // statement_timeout = serverseitig pro Statement, query_timeout = clientseitig (node-pg).
    // KEIN idle_in_transaction_session_timeout: der Vollbestand-Import wickelt tausende
    // Items in EINE tx — Event-Loop-Pausen dazwischen würden ihn sonst fälschlich abbrechen.
    statement_timeout: 120000,
    query_timeout: 120000,
    // Pool erschöpft → nicht ewig auf eine freie Connection warten (sonst hängen Requests).
    connectionTimeoutMillis: 10000,
  })
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
