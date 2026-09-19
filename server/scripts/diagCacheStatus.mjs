// Schnelle Prüfung: was steht gerade im veraenderungen_cache? `node scripts/diagCacheStatus.mjs`
import { createDefaultDb } from "/app/src/db.js"
const db = createDefaultDb()
const { rows } = await db.query("SELECT tage, berechnet_am FROM veraenderungen_cache ORDER BY tage")
console.log(JSON.stringify(rows))
process.exit(0)
