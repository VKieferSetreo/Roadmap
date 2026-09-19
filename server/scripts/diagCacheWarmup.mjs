// Einmaliger manueller Cache-Warmup (T-747, 18.09.): fuellt veraenderungen_cache SOFORT statt
// bis zum naechsten 05:00-Cron zu warten, und bestaetigt gleichzeitig die finalen Zahlen nach dem
// vorgang_rotation-Fix. Identische Logik wie worker/index.js runVeraenderungenCache.
// Nur lesend+dieser eine Cache-Write. `node scripts/diagCacheWarmup.mjs`.
import { createDefaultDb } from "/app/src/db.js"
import { berechneUebersicht } from "/app/src/routes/veraenderungen.js"

const db = createDefaultDb()
for (const tage of [7, 30, 90]) {
  const t0 = Date.now()
  const payload = await berechneUebersicht(db, tage)
  await db.query(
    `INSERT INTO veraenderungen_cache (tage, payload, berechnet_am) VALUES ($1, $2, now())
     ON CONFLICT (tage) DO UPDATE SET payload = excluded.payload, berechnet_am = excluded.berechnet_am`,
    [tage, JSON.stringify(payload)],
  )
  console.log(`tage=${tage} (${Date.now() - t0}ms): gesamt=${JSON.stringify(payload.gesamt)} roh=${JSON.stringify(payload.roh)}`)
  const autobahnNeu = payload.proStrassenklasse?.neu?.autobahn ?? 0
  console.log(`  Autobahn-neu=${autobahnNeu}`)
}
process.exit(0)
