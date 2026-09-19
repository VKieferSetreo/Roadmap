// Schnelle Namens-Aufloesung fuer Quellen-Ids (T-748). `node scripts/diagQuellenNamen.mjs`
import { createDefaultDb } from "/app/src/db.js"
const db = createDefaultDb()
const ids = ["0001", "0145", "0147", "0152", "0115"]
const { rows } = await db.query("SELECT id, name FROM quellen WHERE id = ANY($1)", [ids])
console.log(JSON.stringify(rows, null, 2))
// Beispiel-Zeilen aus 0001 selbst, um die Struktur zu verstehen
const { rows: sample } = await db.query(
  "SELECT name, kategorie, strassen_ref, gueltig_von, gueltig_bis FROM obstacles WHERE quellen_id = '0001' AND strassen_ref ~* '^A[0-9]' ORDER BY created_at DESC LIMIT 8",
)
console.log(JSON.stringify(sample, null, 2))
process.exit(0)
