// Verlorene Fertig-Marken aus den vorhandenen Zeilen wiederherstellen (T-657).
//
// AUFRUF:
//   docker run --rm --network setreo-net -e DATABASE_URL="…" <app-image> \
//     node scripts/anreicherungMarkenReparieren.mjs [--schreiben]
//
// WARUM ES DAS GIBT: am 02.09.2026 hat die Nachpruefung 1,4 Millionen "veraltete" Leermeldungen
// geloescht — und die Fertig-Marke ist technisch eine davon (stand='leer'). Damit fielen die
// Marken von 74.167 auf 12.896, und 61.000 laengst bearbeitete Punkte galten wieder als offen.
// Der naechste Lauf haette sie alle noch einmal durchgekaut, mit dem 14B rund 68 Stunden lang.
//
// Ursache war ein Kreislauf: der quelle_hash lief ueber den fertigen Prompt, und der enthaelt
// attrs — genau dort, wo spieleEin die abgeleiteten Werte eintraegt. Jedes Einspielen machte so
// die eigene Arbeit ungueltig. Behoben in quellHashVon(); dieses Skript raeumt die Folgen auf.
//
// DER NACHWEIS, dass ein Punkt durch war, steckt in seinen uebrigen Zeilen: wer eine Angabe oder
// eine Verwerfung eines Modells traegt, ist von diesem Modell gesehen worden. Das ist keine
// Vermutung, sondern eine Spur, die der Lauf selbst hinterlassen hat.
//
// KONSERVATIV: die Marke bekommt den NEUEN Hash (ueber die Quelle). Aendert die Behoerde spaeter
// ihren Text, greift die Veralterung wieder — nur eben nicht mehr durch unsere eigenen Eintraege.

import { createDefaultDb } from "../src/db.js"
import { quellHashVon, FERTIG_FELD } from "../src/anreicherung/lauf.js"
import { FELDER } from "../src/anreicherung/extrakt.js"

const SCHREIBEN = process.argv.includes("--schreiben")
const db = createDefaultDb()
const sage = (t) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${t}`)
const KATALOG_GROESSE = String(Object.keys(FELDER).length)

// --basis: den GESAMTEN aktiven Bestand als bearbeitet markieren, nicht nur die mit Spuren.
//
// Max, 02.09.2026: "der aktuelle Stand ist jetzt BASE und da haben wir alles raus. Nicht von
// vorne. Aber jetzt kann man den einmal daily nachts auf den neuen Punkten scharf schalten."
//
// Das ist eine ENTSCHEIDUNG, keine Rekonstruktion: fuer 45.305 Punkte gibt es keine Spur mehr,
// dass sie schon gesehen wurden — ihre Leermeldungen sind geloescht. Sie erneut zu rechnen kostet
// neun Stunden fuer Ergebnisse, die schon einmal leer waren. Der Bestand gilt deshalb als
// abgearbeitet, und der Nachtlauf kuemmert sich um das, was NEU dazukommt.
const BASIS = process.argv.includes("--basis")
const MODELL_BASIS = process.env.BASIS_MODELL || "qwen2.5:7b-instruct"

const { rows } = BASIS
  ? await db.query(
      `SELECT o.id::text AS ziel_id, $2::text AS modell,
              o.id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig,
              o.roh, o.richtung, o.gueltig_von, o.gueltig_bis
         FROM obstacles o
        WHERE o.aktiv = true
          AND NOT EXISTS (
            SELECT 1 FROM anreicherung m
             WHERE m.ziel_typ = 'obstacle' AND m.ziel_id = o.id::text
               AND m.modell = $2 AND m.feld = $1)`,
      [FERTIG_FELD, MODELL_BASIS],
    )
  // Ohne --basis nur die Punkte, die Spuren eines Modells tragen: dort ist die Marke belegt.
  : await db.query(
      `SELECT DISTINCT a.ziel_id, a.modell,
              o.id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig,
              o.roh, o.richtung, o.gueltig_von, o.gueltig_bis
         FROM anreicherung a
         JOIN obstacles o ON o.id::text = a.ziel_id
        WHERE a.ziel_typ = 'obstacle' AND a.feld <> $1
          AND NOT EXISTS (
            SELECT 1 FROM anreicherung m
             WHERE m.ziel_typ = 'obstacle' AND m.ziel_id = a.ziel_id
               AND m.modell = a.modell AND m.feld = $1)`,
      [FERTIG_FELD],
    )
if (BASIS) sage(`--basis: der aktive Bestand gilt als abgearbeitet (Modell ${MODELL_BASIS}).`)
sage(`${rows.length} Punkt/Modell-Paare ohne Fertig-Marke, aber mit Spuren.`)

const jeModell = new Map()
for (const r of rows) jeModell.set(r.modell, (jeModell.get(r.modell) ?? 0) + 1)
for (const [m, n] of [...jeModell].sort((a, b) => b[1] - a[1])) sage(`  ${String(n).padStart(6)} ${m}`)

if (!SCHREIBEN) {
  sage("Probelauf — nichts geschrieben. Mit --schreiben wiederholen.")
  process.exit(0)
}

let gesetzt = 0
for (let i = 0; i < rows.length; i += 500) {
  const teil = rows.slice(i, i + 500)
  const werte = []
  const params = []
  for (const r of teil) {
    const p = params.length
    params.push(r.ziel_id, r.modell, quellHashVon(r))
    werte.push(`('obstacle', $${p + 1}, '${FERTIG_FELD}', '${KATALOG_GROESSE}', NULL, $${p + 2}, $${p + 3}, 'marke')`)
  }
  const r = await db.query(
    `INSERT INTO anreicherung (ziel_typ, ziel_id, feld, wert, beleg, modell, quelle_hash, stand)
     VALUES ${werte.join(", ")}
     ON CONFLICT (ziel_typ, ziel_id, feld, modell) WHERE stand IN ('ok', 'leer', 'marke') DO NOTHING`,
    params,
  )
  gesetzt += r.rowCount ?? 0
  if ((i / 500) % 20 === 0) sage(`  … ${i + teil.length} von ${rows.length}`)
}
sage(`${gesetzt} Fertig-Marken wiederhergestellt.`)
process.exit(0)
