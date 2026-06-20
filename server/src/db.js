// Postgres-Zugriff. Die App spricht nur gegen das schmale { query, tx }-Interface,
// damit Tests ein Fake-db injizieren können (kein echtes Postgres nötig).

import pg from "pg"

// T-465: DATE-Spalten (oid 1082: gueltig_von/bis, realer_start) als rohen "YYYY-MM-DD"-String
// liefern. Sonst parst node-pg sie zu einem Date auf LOKALER Mitternacht, und toIsoDate(date)
// .toISOString() verschiebt bei nicht-UTC-Container-TZ um einen Tag → gültige Hindernisse fielen
// aus Karte/PDF. Der String-Pfad in toIsoDate/dateOnly ist bereits TZ-sicher; kein Code rechnet
// direkt mit dem Date-Objekt dieser Spalten.
pg.types.setTypeParser(1082, (v) => v)

export function createPool(connectionString = process.env.DATABASE_URL) {
  const pool = new pg.Pool({
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
  // T-470: node-pg emittiert auf IDLE Clients ein 'error'-Event, wenn Postgres die Verbindung
  // serverseitig schließt (DB-Restart, Coolify-Redeploy, TCP-Idle-Reset). Ohne Listener wird das
  // zu einem uncaughtException → Prozess-Crash. Loggen statt sterben; node-pg verwirft den kaputten
  // Client selbst, der Pool baut beim nächsten connect() neu auf.
  pool.on("error", (err) =>
    console.error(`[pg ${new Date().toISOString()}] idle-client-error (ignoriert):`, err?.message ?? err),
  )
  return pool
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
    /** Dedizierte Session-Connection OHNE Transaktion (T-333/T-342) — für Session-Advisory-Locks,
     *  die einen langen Vorgang serialisieren sollen, ohne eine Tx (und damit "idle in transaction")
     *  über die gesamte Dauer offenzuhalten. Connection in jedem Pfad zurückgeben. */
    async session(fn) {
      const client = await pool.connect()
      try {
        return await fn({ query: (text, params) => client.query(text, params) })
      } finally {
        client.release()
      }
    },
  }
}

export function createDefaultDb() {
  return createDb(createPool())
}
