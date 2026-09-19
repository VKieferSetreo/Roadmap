// Namen + Beispiel-Ueberlappungen fuer die Top-Quellenpaare aus diagAllgemeineQuellenDubletten.mjs
// (T-748, 19.09.). Nur lesend. `node scripts/diagQuellenpaareNamen.mjs`.
import { createDefaultDb } from "/app/src/db.js"

const db = createDefaultDb()
const ids = ["0001","0129","0130","0131","0132","0135","0143","0144","0145","0147","0148",
  "0149","0152","0156","0114","0115","0210","0213","0219","0224"]
const { rows: quellen } = await db.query("SELECT id, name FROM quellen WHERE id = ANY($1) ORDER BY id", [ids])
console.log("QUELLEN:")
console.log(JSON.stringify(quellen, null, 2))

const paare = [
  ["0129","0148"], ["0149","0156"], ["0147","0210"], ["0114","0115"], ["0148","0156"],
  ["0132","0143"], ["0131","0147"], ["0147","0224"], ["0115","0135"], ["0144","0219"],
]
for (const [a, b] of paare) {
  const { rows } = await db.query(
    `SELECT x.name AS a_name, y.name AS b_name, x.kategorie
     FROM obstacles x JOIN obstacles y ON x.id <> y.id
     WHERE x.quellen_id = $1 AND y.quellen_id = $2 AND x.kategorie = y.kategorie
       AND x.aktiv = true AND y.aktiv = true
       AND x.lat BETWEEN y.lat - 0.003 AND y.lat + 0.003
       AND x.lng BETWEEN y.lng - 0.0045 AND y.lng + 0.0045
     LIMIT 3`,
    [a, b],
  )
  console.log(`\n${a} <-> ${b}:`)
  console.log(JSON.stringify(rows, null, 2))
}
process.exit(0)
