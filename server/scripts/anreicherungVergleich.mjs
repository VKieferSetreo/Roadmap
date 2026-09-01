// Was hat das groessere Modell gebracht? (T-659)
//
// AUFRUF:
//   docker run --rm --network setreo-net -e DATABASE_URL="…" <app-image> \
//     node scripts/anreicherungVergleich.mjs qwen2.5:7b-instruct qwen2.5:14b-instruct
//
// Beide Laeufe schreiben unter eigenem Modellnamen, also stehen ihre Ergebnisse nebeneinander in
// derselben Tabelle. Damit laesst sich Feld fuer Feld vergleichen, statt zu vermuten — und genau
// das ist der Zweck der Trennung.
//
// DREI FRAGEN, und die dritte ist die unbequeme:
//   ZUGEWINN     Felder, die nur das neue Modell belegen konnte. Die Zahl, um die es geht.
//   WIDERSPRUCH  Felder, die beide beantwortet haben, mit verschiedenen Werten. Jeder davon ist
//                ein Fall zum Ansehen: zwei Modelle, die dieselbe Stelle verschieden lesen, sind
//                ein Hinweis auf eine unklare Frage, nicht auf ein schlechtes Modell.
//   RUECKSTAND   Felder, die nur das ALTE Modell belegt hat. Haeuft sich das, lenkt der
//                Fokus-Hinweis vom Rest ab und der Prompt gehoert zurueckgebaut.

import { createDefaultDb } from "../src/db.js"

const [alt, neu] = process.argv.slice(2)
if (!alt || !neu) {
  console.error("Aufruf: node scripts/anreicherungVergleich.mjs <altes Modell> <neues Modell>")
  process.exit(1)
}
const db = createDefaultDb()
const zahl = (n) => Number(n ?? 0).toLocaleString("de-DE")

const { rows: [k] } = await db.query(
  `SELECT count(*) FILTER (WHERE modell = $1 AND stand = 'ok' AND wert IS NOT NULL) AS alt_angaben,
          count(*) FILTER (WHERE modell = $2 AND stand = 'ok' AND wert IS NOT NULL) AS neu_angaben,
          count(DISTINCT ziel_id) FILTER (WHERE modell = $2 AND feld = '_fertig') AS neu_punkte,
          count(*) FILTER (WHERE modell = $2 AND stand = 'verworfen') AS neu_verworfen
     FROM anreicherung`,
  [alt, neu],
)
console.log(`\n${alt}: ${zahl(k.alt_angaben)} Angaben`)
console.log(`${neu}: ${zahl(k.neu_angaben)} Angaben auf ${zahl(k.neu_punkte)} Punkten, ${zahl(k.neu_verworfen)} abgewiesen`)

// Der Vergleich laeuft ueber (Ziel, Feld) — die Einheit, in der beide Modelle antworten.
const { rows: [v] } = await db.query(
  `WITH a AS (SELECT ziel_id, feld, wert FROM anreicherung
               WHERE modell = $1 AND stand = 'ok' AND wert IS NOT NULL),
        n AS (SELECT ziel_id, feld, wert FROM anreicherung
               WHERE modell = $2 AND stand = 'ok' AND wert IS NOT NULL)
   SELECT count(*) FILTER (WHERE a.wert IS NULL) AS zugewinn,
          count(*) FILTER (WHERE n.wert IS NULL) AS rueckstand,
          count(*) FILTER (WHERE a.wert IS NOT NULL AND n.wert IS NOT NULL AND a.wert <> n.wert) AS widerspruch,
          count(*) FILTER (WHERE a.wert = n.wert) AS einig
     FROM a FULL OUTER JOIN n USING (ziel_id, feld)`,
  [alt, neu],
)
console.log(`\n  ZUGEWINN     ${zahl(v.zugewinn).padStart(7)}  nur ${neu} konnte belegen`)
console.log(`  einig        ${zahl(v.einig).padStart(7)}  beide, gleicher Wert`)
console.log(`  WIDERSPRUCH  ${zahl(v.widerspruch).padStart(7)}  beide, VERSCHIEDENER Wert — ansehen`)
console.log(`  RUECKSTAND   ${zahl(v.rueckstand).padStart(7)}  nur ${alt} konnte belegen`)

const { rows: felder } = await db.query(
  `WITH a AS (SELECT ziel_id, feld, wert FROM anreicherung
               WHERE modell = $1 AND stand = 'ok' AND wert IS NOT NULL),
        n AS (SELECT ziel_id, feld, wert FROM anreicherung
               WHERE modell = $2 AND stand = 'ok' AND wert IS NOT NULL)
   SELECT feld,
          count(*) FILTER (WHERE a.wert IS NULL) AS zugewinn,
          count(*) FILTER (WHERE n.wert IS NULL) AS rueckstand,
          count(*) FILTER (WHERE a.wert IS NOT NULL AND n.wert IS NOT NULL AND a.wert <> n.wert) AS widerspruch
     FROM a FULL OUTER JOIN n USING (ziel_id, feld)
    GROUP BY feld HAVING count(*) FILTER (WHERE a.wert IS NULL) > 0
    ORDER BY 2 DESC LIMIT 15`,
  [alt, neu],
)
if (felder.length) {
  console.log("\n  Zugewinn nach Feld:")
  console.log("  Feld                    +neu   -alt   Widerspruch")
  for (const f of felder) {
    console.log(`  ${f.feld.padEnd(22)} ${String(f.zugewinn).padStart(5)}  ${String(f.rueckstand).padStart(5)}   ${String(f.widerspruch).padStart(5)}`)
  }
}

// Die Widersprueche im Wortlaut — ohne sie ist die Zahl oben nicht handhabbar.
const { rows: streit } = await db.query(
  `SELECT a.feld, a.wert AS alt_wert, n.wert AS neu_wert, left(o.name, 45) AS name,
          left(a.beleg, 55) AS alt_beleg, left(n.beleg, 55) AS neu_beleg
     FROM anreicherung a
     JOIN anreicherung n ON n.ziel_id = a.ziel_id AND n.feld = a.feld AND n.modell = $2
     LEFT JOIN obstacles o ON o.id::text = a.ziel_id
    WHERE a.modell = $1 AND a.stand = 'ok' AND n.stand = 'ok'
      AND a.wert IS NOT NULL AND n.wert IS NOT NULL AND a.wert <> n.wert
    LIMIT 15`,
  [alt, neu],
)
if (streit.length) {
  console.log("\n  Widersprüche im Wortlaut:")
  for (const s of streit) {
    console.log(`\n  ${s.name} — ${s.feld}`)
    console.log(`    alt: ${s.alt_wert}  ←  "${s.alt_beleg}"`)
    console.log(`    neu: ${s.neu_wert}  ←  "${s.neu_beleg}"`)
  }
}
process.exit(0)
