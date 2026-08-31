// Aufgezeichnete Verwerfungen noch einmal durch die Riegel schicken (T-657).
//
// AUFRUF:
//   docker run --rm --network setreo-net -e DATABASE_URL="…" <app-image> \
//     node scripts/anreicherungNachpruefen.mjs [--schreiben]
//
// Ohne --schreiben wird nur gezaehlt. Das ist Absicht: der Lauf faellt sonst leicht unter den
// Tisch, und ein Skript, das Produktivdaten anfasst, soll man zweimal starten muessen.
//
// WOZU: schaerft man einen Riegel nach, holt der Bestandslauf die betroffenen Punkte NICHT
// nach. Sie tragen fuer jedes Feld bereits eine Zeile (stand='leer'), und genau daran erkennt der
// Lauf, dass er sie ueberspringen darf. Eine Angabe, die frueher zu Unrecht verworfen wurde, waere
// damit dauerhaft verloren — obwohl die Antwort des Modells woertlich in der Datenbank steht.
//
// Der Trick ist, dass sie das tut: seit Migration 069 haelt jede Verwerfung ihre Rohantwort und
// den Hash des Quelltexts fest. Damit laesst sich dieselbe Antwort gegen die neuen Riegel pruefen,
// ohne ein Modell auch nur anzufassen — Sekunden statt Stunden GPU.
//
// DER HASH IST DIE SICHERUNG: nur wo sich der Quelltext exakt rekonstruieren laesst, ist die
// Pruefung dieselbe wie damals. Hat der Punkt sich seither geaendert, wird uebersprungen.

import { createDefaultDb } from "../src/db.js"
import { pruefeAngabe, quelleHash } from "../src/anreicherung/extrakt.js"
import { quelltextVon } from "../src/anreicherung/lauf.js"
import { spieleEin } from "../src/anreicherung/einspielen.js"

const SCHREIBEN = process.argv.includes("--schreiben")
const db = createDefaultDb()
const sage = (t) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${t}`)

const { rows } = await db.query(
  `SELECT a.id, a.ziel_id, a.feld, a.roh_wert, a.beleg, a.modell, a.quelle_hash,
          o.id AS o_id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig,
          o.attrs, o.roh, o.richtung, o.gueltig_von, o.gueltig_bis, o.quelle
     FROM anreicherung a
     JOIN obstacles o ON o.id::text = a.ziel_id
    WHERE a.ziel_typ = 'obstacle' AND a.stand = 'verworfen'
    ORDER BY a.id`,
)
sage(`${rows.length} aufgezeichnete Verwerfungen.`)

const zahl = { geprueft: 0, hashDaneben: 0, gerettet: 0, bleibt: 0, dublette: 0 }
// Ein Feld je Punkt nur einmal — dieselbe Regel wie im Lauf. Nennt das Modell zwei Werte fuers
// selbe Feld, ist die Aussage nicht eindeutig, und aus einer uneindeutigen wird kein Stammdatum.
const schonGerettet = new Set()

for (const r of rows) {
  const text = quelltextVon(r)
  if (quelleHash(text) !== r.quelle_hash) { zahl.hashDaneben++; continue }
  zahl.geprueft++

  const p = pruefeAngabe({ feld: r.feld, wert: r.roh_wert, beleg: r.beleg }, text)
  if (!p.ok) { zahl.bleibt++; continue }

  const schluessel = `${r.ziel_id}|${p.feld}`
  if (schonGerettet.has(schluessel)) { zahl.dublette++; continue }
  schonGerettet.add(schluessel)
  zahl.gerettet++

  if (!SCHREIBEN) continue
  // Die Leerzeile desselben Felds tragen wir nach — sie ist es, die den Lauf blockiert. Gibt es
  // sie nicht (etwa weil das Feld unter einem Alias kam), legen wir eine an.
  //
  // NUR 'leer', NIE 'ok': eine bereits angenommene Angabe darf eine nachtraeglich gerettete nicht
  // verdraengen. Sie ist durch dieselben Riegel gegangen, und wo beide etwas sagen, gilt die
  // aeltere. Faengt das UPDATE nichts, verhindert der Eindeutigkeits-Index beim INSERT den Rest.
  const u = await db.query(
    `UPDATE anreicherung SET wert = $1, beleg = $2, stand = 'ok', erstellt_am = now()
      WHERE ziel_typ = 'obstacle' AND ziel_id = $3 AND feld = $4 AND modell = $5
        AND stand = 'leer'
      RETURNING id`,
    [p.wert, p.beleg, r.ziel_id, p.feld, r.modell],
  )
  if (!u.rows.length) {
    await db.query(
      `INSERT INTO anreicherung (ziel_typ, ziel_id, feld, wert, beleg, modell, quelle_hash, stand)
       VALUES ('obstacle', $1, $2, $3, $4, $5, $6, 'ok')
       ON CONFLICT DO NOTHING`,
      [r.ziel_id, p.feld, p.wert, p.beleg, r.modell, r.quelle_hash],
    )
  }
}

sage(`geprueft ${zahl.geprueft}, Quelltext geaendert ${zahl.hashDaneben}`)
sage(`GERETTET ${zahl.gerettet}, weiterhin verworfen ${zahl.bleibt}, Dubletten ${zahl.dublette}`)

if (SCHREIBEN) {
  const ein = await spieleEin(db)
  sage(`in den Bestand gespielt: ${ein.aktualisiert} Punkte aktualisiert.`)
} else {
  sage("Probelauf — nichts geschrieben. Mit --schreiben wiederholen.")
}
process.exit(0)
