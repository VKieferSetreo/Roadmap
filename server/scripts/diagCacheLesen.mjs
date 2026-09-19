// Liest den aktuellen Cache-Inhalt fuer ein `tage`-Fenster (CLI-Arg). `node scripts/diagCacheLesen.mjs 30`
import { createDefaultDb } from "/app/src/db.js"
const tage = Number(process.argv[2] ?? 30)
const db = createDefaultDb()
const { rows: [row] } = await db.query("SELECT payload, berechnet_am FROM veraenderungen_cache WHERE tage = $1", [tage])
const p = row.payload
console.log(`berechnet_am=${row.berechnet_am}`)
console.log(`gesamt=${JSON.stringify(p.gesamt)}`)
console.log(`roh=${JSON.stringify(p.roh)}`)
console.log(`proStrassenklasse.neu=${JSON.stringify(p.proStrassenklasse.neu)}`)
console.log(`proStrassenklasse.geaendert=${JSON.stringify(p.proStrassenklasse.geaendert)}`)
process.exit(0)
