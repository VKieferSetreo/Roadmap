// Wie diagCacheWarmup.mjs, aber EIN `tage`-Wert pro Aufruf (CLI-Arg) — haelt jeden Coolify-
// scheduled_tasks-run_once-Aufruf unter dem Poll-Timeout. `node scripts/diagCacheWarmupEin.mjs 30`
import { createDefaultDb } from "/app/src/db.js"
import { berechneUebersicht } from "/app/src/routes/veraenderungen.js"

const tage = Number(process.argv[2] ?? 30)
const db = createDefaultDb()
const t0 = Date.now()
const payload = await berechneUebersicht(db, tage)
await db.query(
  `INSERT INTO veraenderungen_cache (tage, payload, berechnet_am) VALUES ($1, $2, now())
   ON CONFLICT (tage) DO UPDATE SET payload = excluded.payload, berechnet_am = excluded.berechnet_am`,
  [tage, JSON.stringify(payload)],
)
console.log(`tage=${tage} (${Date.now() - t0}ms)`)
console.log(`gesamt=${JSON.stringify(payload.gesamt)}`)
console.log(`roh=${JSON.stringify(payload.roh)}`)
console.log(`Autobahn-neu=${payload.proStrassenklasse?.neu?.autobahn ?? 0}`)
process.exit(0)
