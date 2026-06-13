// Integrierte DB-Schreibfunktion für die Cron-Jobs (Roadmap-Format v1.0 → obstacles).
// Ein Cron-Job pullt + formatiert + schreibt — kein zweiter Schritt. Standardmäßig AUS
// (Dry-Run, nur Verifikations-JSON); scharf via ENV ROADMAP_WRITE_DB=1 + DATABASE_URL.
// Voraussetzung: Migration 005 angewandt (v1.0-Spalten) + `npm i` im API-Ordner (pg).
//
// Upsert-Anker: (quellen_id, externe_id). Bestehend → Sachfelder-Update (fach_id/realer_start
// stabil). Neu → fach_id-Vergabe (advisory-xact-lock, MAX(index)+1 pro Quelle) wie obstaclesRepo.

const COLS = [
  "kategorie", "befristung", "name", "beschreibung", "lat", "lng", "geom", "richtung",
  "strassen_ref", "strassenklasse", "baulasttraeger", "vnk", "nnk", "station_von", "station_bis",
  "attrs", "gueltig_von", "gueltig_bis", "zeitfenster", "quelle", "roh", "status", "abgerufen_am",
]

function ddmmyy(iso) {
  const d = iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso : new Date().toISOString().slice(0, 10)
  const [y, m, dd] = d.slice(0, 10).split("-")
  return `${dd}${m}${y.slice(2)}`
}

const J = (v) => (v == null ? null : JSON.stringify(v))

/** Schreibt normalisierte Hindernisse (v1.0) idempotent in die DB. Gibt {neu, aktualisiert} zurück. */
export async function writeObstaclesToDb(obstacles, quelle, { databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL fehlt (ROADMAP_WRITE_DB=1 gesetzt?)")
  const { default: pg } = await import("pg") // lazy: nur im DB-Modus nötig
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  let neu = 0, aktualisiert = 0
  try {
    // Quelle sicherstellen (Register)
    await client.query(
      `INSERT INTO quellen (id, name, typ, aktiv) VALUES ($1, $2, 'api', true) ON CONFLICT (id) DO NOTHING`,
      [quelle.id, quelle.name ?? quelle.id],
    )
    for (const o of obstacles) {
      if (!o.externe_id) continue // ohne Dedupe-Anker nicht idempotent schreibbar → überspringen
      await client.query("BEGIN")
      try {
        const found = await client.query(
          "SELECT id FROM obstacles WHERE quellen_id = $1 AND externe_id = $2",
          [o.quellen_id, o.externe_id],
        )
        const vals = COLS.map((c) =>
          c === "geom" || c === "attrs" || c === "zeitfenster" || c === "quelle" || c === "roh" ? J(o[c]) : o[c],
        )
        if (found.rows[0]) {
          // Sachfelder-Update (fach_id, realer_start, tenant, aktiv bleiben stabil)
          const set = COLS.map((c, i) => `${c} = $${i + 2}`).join(", ")
          await client.query(`UPDATE obstacles SET ${set}, updated_at = now() WHERE id = $1`, [
            found.rows[0].id, ...vals,
          ])
          aktualisiert++
        } else {
          // fach_id vergeben (serialisiert pro Quelle)
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`roadmap_fachid_${o.quellen_id}`])
          const mx = await client.query(
            `SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR 4)::int), 0) AS mi
               FROM obstacles WHERE quellen_id = $1 AND fach_id ~ '^[0-9]{4}'`,
            [o.quellen_id],
          )
          const idx = String(Number(mx.rows[0]?.mi ?? 0) + 1).padStart(4, "0")
          const fachId = idx + o.quellen_id + ddmmyy(o.realer_start)
          const colList = ["fach_id", "quellen_id", "externe_id", "realer_start", "aktiv", "demo", "tenant_id", ...COLS]
          const ph = colList.map((_, i) => `$${i + 1}`).join(", ")
          await client.query(
            `INSERT INTO obstacles (${colList.join(", ")}) VALUES (${ph})`,
            [fachId, o.quellen_id, o.externe_id, o.realer_start, true, false, null, ...vals],
          )
          neu++
        }
        await client.query("COMMIT")
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }
    }
  } finally {
    await client.end()
  }
  return { neu, aktualisiert }
}
