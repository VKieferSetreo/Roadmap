// Zaehlt, was bestaetigt ist, aber noch nicht im Bestand steht (T-662).
//
// AUFRUF:
//   docker run --rm --network setreo-net -e DATABASE_URL="…" <app-image> \
//     node scripts/anreicherungOffen.mjs
//
// RUECKGABE: 0 = alles eingespielt, 1 = es fehlt etwas, 2 = die Abfrage selbst ging schief.
// Genau dafuer ist es da: der Nachtlauf fragt damit nach, BEVOR er die Workstation ausmacht.
//
// Max, 02.09.2026: "sicherstellen, dass wenn fertig alles sauber abgelegt und gespeichert wird,
// und wenn's dann sauber auf Prod ist, erst Workstation runtergefahren wird."
//
// WARUM NICHT EINFACH DEM EINSPIELEN GLAUBEN: spieleEin() meldet, wie viele Zeilen es angefasst
// hat — nicht, ob danach nichts mehr offen ist. Die beiden Zahlen sind verschieden, sobald ein
// Lauf abbricht, eine Verbindung wegbricht oder der Import dazwischenfunkt. Nachzaehlen ist die
// einzige Auskunft, die auch dann noch stimmt.
//
// GEPRUEFT WIRD AUF VORHANDENSEIN DES FELDES, nicht auf Wertgleichheit. spieleEin schreibt nur in
// Luecken (`a.werte || o.attrs`): wo die Quelle selbst etwas sagt, gewinnt sie, und dann steht in
// attrs zu Recht ein anderer Wert als bei uns. Ein Feld, das ueberhaupt nicht in attrs auftaucht,
// ist dagegen schlicht nicht angekommen.

import { createDefaultDb } from "../src/db.js"

const db = createDefaultDb()

try {
  const { rows } = await db.query(
    `SELECT count(*)::int AS offen, count(DISTINCT a.ziel_id)::int AS punkte
       FROM anreicherung a
       JOIN obstacles o ON o.id::text = a.ziel_id
      WHERE a.ziel_typ = 'obstacle' AND a.stand = 'ok' AND a.wert IS NOT NULL
        AND (a.geprueft IS NULL OR a.geprueft = true)
        AND NOT (coalesce(o.attrs, '{}'::jsonb) ? a.feld)`,
  )
  const { offen, punkte } = rows[0]
  if (offen === 0) {
    console.log("alles eingespielt")
    process.exit(0)
  }
  console.log(`${offen} Angaben auf ${punkte} Punkten stehen noch NICHT im Bestand`)
  process.exit(1)
} catch (e) {
  // Eigener Ausgang: "ich konnte nicht nachsehen" ist etwas anderes als "es fehlt etwas", und der
  // Aufrufer muss darauf anders reagieren duerfen.
  console.error(`Nachzaehlen fehlgeschlagen: ${e.message}`)
  process.exit(2)
}
