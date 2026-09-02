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

// ── Die Gegenrichtung ────────────────────────────────────────────────────────────────────────
//
// Ein schaerferer Riegel wirkt nur auf das, was NOCH KOMMT. Was schon uebernommen ist, bleibt
// stehen — auch wenn es nach heutigem Stand falsch ist. Gemessen am 31.08.2026: 10 von 200
// uebernommenen Angaben waren reine Geh-/Radweg-Meldungen, als Fahrbahnverengung gefuehrt.
//
// Geprueft wird gegen den BELEG als Quelltext. Das ist zulaessig und sogar genauer: dass der Beleg
// im Quelltext stand, war beim Lauf wahr und ist nicht die Frage. Die Frage ist, ob der Wert die
// heutigen Riegel haelt — und die schauen alle auf den Beleg.
const { rows: bestand } = await db.query(
  `SELECT id, ziel_id, feld, wert, beleg, modell FROM anreicherung
    WHERE ziel_typ = 'obstacle' AND stand = 'ok' AND wert IS NOT NULL`,
)
const faul = []
for (const b of bestand) {
  const p = pruefeAngabe({ feld: b.feld, wert: b.wert, beleg: b.beleg }, b.beleg ?? "")
  if (!p.ok) faul.push({ ...b, grund: p.grund })
}
sage(`\nBestand: ${bestand.length} uebernommene Angaben, ${faul.length} halten die heutigen Riegel nicht.`)
for (const f of faul.slice(0, 20)) sage(`  ${f.feld} = ${f.wert} — ${f.grund} | "${String(f.beleg).slice(0, 60)}"`)

if (SCHREIBEN && faul.length) {
  for (const f of faul) {
    // Erst aus dem Bestand nehmen, dann die Zeile umschreiben: andersherum wuesste der naechste
    // Lauf nicht mehr, welches Feld er zu entfernen hat.
    await db.query(
      `UPDATE obstacles SET attrs = coalesce(attrs, '{}'::jsonb) - $2::text, updated_at = now()
        WHERE id = $1::uuid`,
      [f.ziel_id, f.feld],
    )
    await db.query(
      `UPDATE anreicherung SET stand = 'verworfen', wert = NULL, roh_wert = $2, grund = $3
        WHERE id = $1`,
      [f.id, f.wert, `nachtraeglich: ${f.grund}`],
    )
    // Und die Fertig-Marke des Punktes weg, sonst sieht der Lauf ihn nie wieder an. Seit die
    // Kandidatenwahl nur noch auf die Marke schaut (lauf.js), ist das der einzige Weg zurueck.
    await db.query(
      "DELETE FROM anreicherung WHERE ziel_typ = 'obstacle' AND ziel_id = $1 AND feld = '_fertig' AND modell = $2",
      [f.ziel_id, f.modell],
    )
  }
  sage(`${faul.length} Angaben zurueckgenommen.`)
}

// ── Veraltete Leermeldungen ──────────────────────────────────────────────────────────────────
//
// "Aendert die Quelle ihren Text, ist die Ableitung ungueltig und wird neu gerechnet, statt still
// zu veralten" — so steht es seit dem ersten Tag als Begruendung fuer quelle_hash in
// migrations/068. Gerechnet wurde nie: der Lauf prueft nur, OB eine Zeile existiert, nicht ob sie
// noch zum Text passt. Ein Punkt, zu dem das Modell einmal nichts fand, blieb damit fuer immer
// leer, auch wenn die Quelle inzwischen das Dreifache liefert.
//
// Genau das ist jetzt der Fall: seit die Connectoren `roh` mitschicken, haben tausende Punkte
// deutlich mehr Text. Ohne diesen Schritt saehe sie nie wieder jemand an.
//
// NUR LEERMELDUNGEN. Eine uebernommene Angabe bleibt stehen: sie traegt ihren Beleg, und der gilt
// unabhaengig davon, ob rundherum Text dazugekommen ist.
// JE PUNKT, nicht je Zeile. Die erste Fassung lud jede einzelne Leermeldung samt Punktdaten —
// bei 1,4 Millionen Zeilen lief das Skript in sein Zeitlimit, ohne je fertig zu werden. Der
// Quelltext haengt aber am PUNKT, nicht am Feld: einmal rechnen genuegt, und aus 1,4 Millionen
// Zeilen werden rund 74.000 Punkte.
const { rows: punkte } = await db.query(
  `SELECT DISTINCT ON (a.ziel_id) a.ziel_id, a.quelle_hash,
          o.id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig,
          o.attrs, o.roh, o.richtung, o.gueltig_von, o.gueltig_bis, o.quelle
     FROM anreicherung a
     JOIN obstacles o ON o.id::text = a.ziel_id
    WHERE a.ziel_typ = 'obstacle' AND a.stand = 'leer'`,
)
const veraltetePunkte = punkte.filter((z) => quelleHash(quelltextVon(z)) !== z.quelle_hash).map((z) => z.ziel_id)
sage(`\nPunkte mit Leermeldungen: ${punkte.length}, davon auf veraltetem Quelltext: ${veraltetePunkte.length}`)

if (SCHREIBEN && veraltetePunkte.length) {
  let weg = 0
  // In Bloecken, damit der Parameter nicht ueber die Postgres-Grenze waechst.
  for (let i = 0; i < veraltetePunkte.length; i += 2000) {
    // Das `stand = 'leer'` steht hier ein zweites Mal, obwohl die Auswahl oben schon danach
    // filtert. Max, 31.08.2026: "alle abgewiesenen behalten — kann sein, dass wir die manuell
    // später doch noch benutzen." Eine Verwerfung ist Arbeitsergebnis, und die einzige Loeschung
    // in diesem System soll sie nicht einmal versehentlich treffen koennen.
    const r = await db.query(
      "DELETE FROM anreicherung WHERE ziel_typ = 'obstacle' AND stand = 'leer' AND ziel_id = ANY($1::text[])",
      [veraltetePunkte.slice(i, i + 2000)],
    )
    weg += r.rowCount ?? 0
  }
  sage(`${weg} veraltete Leermeldungen entfernt — der naechste Lauf sieht diese Punkte wieder an.`)
}

if (SCHREIBEN) {
  const ein = await spieleEin(db)
  sage(`in den Bestand gespielt: ${ein.aktualisiert} Punkte aktualisiert.`)
} else {
  sage("Probelauf — nichts geschrieben. Mit --schreiben wiederholen.")
}
process.exit(0)
