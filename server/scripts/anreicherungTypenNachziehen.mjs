// Bereits eingespielte Werte auf ihren richtigen Typ ziehen (T-664/F1, einmalig).
//
// AUFRUF:
//   docker exec <api-container> node scripts/anreicherungTypenNachziehen.mjs [--schreiben]
//
// Ohne --schreiben wird nur gezaehlt, wie bei anreicherungNachpruefen.mjs.
//
// WOZU: spieleEin typisiert seit T-667 richtig, aber es schreibt NUR IN LUECKEN
// (`a.werte || o.attrs`, und in jsonb gewinnt der rechte Operand). Was frueher als Zeichenkette
// in attrs gelandet ist, bleibt deshalb liegen — der Fix wirkt nur auf Neues. Gemessen am
// 05.09.2026: 13.383 Werte auf aktiven Hindernissen standen als String, darunter 1.929
// vollsperrung, 3.377 umleitung und 1.794 fahrbahnVerengt. Fuer die Engine sind sie nicht da.
//
// WARUM NICHT nimmZurueck + spieleEin: nimmZurueck entfernt JEDES Feld, das in der
// Anreicherungstabelle steht, auch wenn der Wert in attrs von der QUELLE stammt und nur zufaellig
// denselben Namen traegt. Genau dieser Fehler ist am 31.08.2026 schon einmal passiert und hat 20
// gemeldete sperrungArt-Werte gekostet (siehe Kommentar an nimmZurueck).
//
// DIE SICHERUNG IST DER WERTVERGLEICH: angefasst wird nur, wo der Wert in attrs ZEICHENGLEICH
// dem Wert in der Anreicherungstabelle ist. Dann stammt er von dort. Steht in attrs etwas
// anderes, hat die Quelle gesprochen, und die gewinnt unveraendert.

import { createDefaultDb } from "../src/db.js"
import { BOOL_FELDER, ZAHL_FELDER } from "../src/anreicherung/felder.js"

const SCHREIBEN = process.argv.includes("--schreiben")
const db = createDefaultDb()
const sage = (t) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${t}`)
const p = [BOOL_FELDER, ZAHL_FELDER]

// Dieselbe Fallunterscheidung wie in spieleEin, damit beide Wege denselben Wert erzeugen.
const TYPISIERT = `CASE
        WHEN a.feld = ANY($1::text[]) AND a.wert IN ('true','false') THEN to_jsonb(a.wert::boolean)
        WHEN a.feld = ANY($2::text[]) AND a.wert ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN to_jsonb(a.wert::numeric)
        ELSE to_jsonb(a.wert)
      END`

const BEDINGUNG = `a.ziel_typ = 'obstacle' AND a.stand = 'ok' AND a.wert IS NOT NULL
      AND (a.geprueft IS NULL OR a.geprueft = true)
      AND (a.feld = ANY($1::text[]) OR a.feld = ANY($2::text[]))
      AND jsonb_typeof(o.attrs -> a.feld) = 'string'
      AND o.attrs ->> a.feld = a.wert`

const { rows: vorschau } = await db.query(
  `SELECT a.feld, count(*)::int n
     FROM obstacles o JOIN anreicherung a ON o.id::text = a.ziel_id
    WHERE ${BEDINGUNG}
    GROUP BY 1 ORDER BY 2 DESC`,
  p,
)
const gesamt = vorschau.reduce((s, r) => s + r.n, 0)
sage(`${gesamt} Werte stehen als Zeichenkette und stammen nachweislich aus der Anreicherung:`)
for (const r of vorschau) sage(`   ${String(r.n).padStart(5)}  ${r.feld}`)

if (!SCHREIBEN) {
  sage("Probelauf — nichts geschrieben. Mit --schreiben wiederholen.")
  process.exit(0)
}

// ALLE Felder eines Punktes in EINEM Zug. `UPDATE ... FROM` verbindet jede Zielzeile mit
// hoechstens einer Quellzeile: ein Hindernis mit fuenf Textwerten bekaeme sonst nur einen davon
// typisiert, und man muesste das Skript so oft aufrufen, bis nichts mehr uebrig ist. Beim ersten
// Versuch blieben dadurch 7.709 von 18.503 liegen.
const { rows } = await db.query(
  `WITH korrekt AS (
     SELECT a.ziel_id::uuid AS id, jsonb_object_agg(a.feld, ${TYPISIERT}) AS werte
       FROM anreicherung a JOIN obstacles o ON o.id::text = a.ziel_id
      WHERE ${BEDINGUNG}
      GROUP BY a.ziel_id
   )
   UPDATE obstacles o
      SET attrs = o.attrs || k.werte, updated_at = now()
     FROM korrekt k
    WHERE o.id = k.id
    RETURNING o.id`,
  p,
)
sage(`${rows.length} Punkte angefasst, alle ihre Textwerte in einem Zug.`)
process.exit(0)
