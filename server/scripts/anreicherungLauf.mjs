// Der Bestandslauf über alle Hindernisse (T-657).
//
// AUFRUF — bewusst in einem EIGENEN Container, nicht im App-Container:
//
//   docker run -d --rm --name anreicherung --network setreo-net \
//     -e DATABASE_URL="…" -e OLLAMA_URL="http://100.85.216.95:11434/v1" \
//     <app-image> node scripts/anreicherungLauf.mjs
//
// Ein Deploy tauscht den App-Container aus und nähme einen darin laufenden Prozess mit. Das ist
// in diesem Projekt schon zweimal passiert, jeweils mitten in einem mehrstündigen Lauf. Ein
// eigener Container überlebt jedes Deploy.
//
// Der Lauf ist wiederaufnehmbar: der Fortschritt steht nach jedem Punkt in der Datenbank. Bricht
// er ab, macht der nächste Start dort weiter, wo er stand, und überspringt alles Erledigte.

import { createDefaultDb } from "../src/db.js"
import { laufeUeberBestand } from "../src/anreicherung/lauf.js"
import { createModell, modellKonfig, erreichbar } from "../src/anreicherung/modell.js"
import { spieleEin } from "../src/anreicherung/einspielen.js"

const BLOCK = Number(process.env.BLOCK || 200)
// ZWEITE RUNDE (Max, 31.08.2026: "wir machen auf den abgewiesenen danach mit 14b noch ne Runde,
// um da noch auszuquetschen"). Gesetzt, laeuft der Durchgang NUR ueber die Punkte, an denen das
// genannte Modell etwas abgewiesen hat — dort stand Text, dort ist etwas zu holen.
//
//   -e ANREICHERUNG_MODELL=qwen2.5:14b-instruct -e NUR_VERWERFUNGEN_VON=qwen2.5:7b-instruct
//
// Der eigene Modellname sorgt dafuer, dass eigene Zeilen entstehen: das Ergebnis des kleineren
// Modells bleibt daneben stehen und laesst sich vergleichen.
const NUR_VERWERFUNGEN_VON = process.env.NUR_VERWERFUNGEN_VON || null
// So viele Punkte gleichzeitig, wie Ollama Stroeme hat. Mehr bringt nichts, die Anfragen wuerden
// dort ohnehin in eine Warteschlange laufen.
const GLEICHZEITIG = Number(process.env.GLEICHZEITIG || 8)
const konfig = modellKonfig(process.env.ANREICHERUNG_WEG || "lokal")
const db = createDefaultDb()

const zeit = () => new Date().toISOString().slice(11, 19)
const sage = (t) => console.log(`[${zeit()}] ${t}`)

sage(`Modell ${konfig.name} über ${konfig.basis}, ${GLEICHZEITIG} Punkte gleichzeitig`)
if (NUR_VERWERFUNGEN_VON) sage(`Zweite Runde: nur Punkte, an denen ${NUR_VERWERFUNGEN_VON} etwas abgewiesen hat.`)
if (!(await erreichbar(konfig))) {
  sage("Modell nicht erreichbar — Abbruch, bevor irgendetwas geschrieben wird.")
  process.exit(1)
}
sage("Modell antwortet.")

const gesamt = await db.query("SELECT count(*)::int AS n FROM obstacles WHERE aktiv = true")
sage(`${gesamt.rows[0].n} aktive Hindernisse im Bestand.`)

const rufeModell = createModell(konfig)
// Drei Rollen auf demselben Modell: gemessen 14 Angaben einstufig gegen 20 dreistufig. Der
// Prüfer korrigiert und holt zu Unrecht Verworfenes zurück, der Ergänzer sucht nach dem, was der
// Leser übersehen hat. Ollama läuft mit vier parallelen Strömen, gemessen 12,3 von 24,6 GB bei
// 91 Prozent Auslastung — ein zweites, größeres Modell daneben wäre zu knapp.
const rollen = { liest: rufeModell, prueft: rufeModell, nimmtAb: rufeModell }
let summe = { gesehen: 0, geschrieben: 0, verworfen: 0, uebersprungen: 0 }
const start = Date.now()

// Sauber aufhören, wenn jemand den Container stoppt: der aktuelle Punkt wird noch fertig, danach
// ist Schluss. Ohne das bliebe eine halb geschriebene Zeile stehen.
let laeuft = true
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { sage(`${s} — halte nach diesem Block an.`); laeuft = false })

while (laeuft) {
  const r = await laufeUeberBestand(db, {
    modell: konfig.name,
    rufeModell,
    rollen,
    grenze: BLOCK,
    gleichzeitig: GLEICHZEITIG,
    nurVerwerfungenVon: NUR_VERWERFUNGEN_VON,
    beiFortschritt: (z) => {
      if (z.gesehen % 25 === 0) {
        const proMin = Math.round((60000 * (summe.gesehen + z.gesehen)) / (Date.now() - start))
        sage(`  ${summe.gesehen + z.gesehen} Punkte, ${summe.geschrieben + z.geschrieben} Angaben gefunden, ${proMin}/min`)
      }
    },
  })
  summe = {
    gesehen: summe.gesehen + r.gesehen,
    geschrieben: summe.geschrieben + r.geschrieben,
    verworfen: summe.verworfen + r.verworfen,
    uebersprungen: summe.uebersprungen + r.uebersprungen,
  }
  // Nach JEDEM Block in den Bestand spielen, nicht erst am Ende. Ein Lauf ueber 73.000 Punkte
  // dauert Tage, und solange nichts eingespielt ist, sieht auf der Karte niemand ein Ergebnis.
  // Der Aufruf ist billig: er fasst nur an, was sich wirklich geaendert hat.
  const ein = await spieleEin(db, { modell: konfig.name }).catch((e) => ({ aktualisiert: 0, fehler: e.message }))
  const min = Math.round((Date.now() - start) / 60000)
  sage(`Block fertig: ${summe.gesehen} Punkte in ${min} min, ${summe.geschrieben} Angaben, ${summe.verworfen} verworfen, ${ein.aktualisiert} Punkte im Bestand aktualisiert`)
  if (!r.rest) { sage("Bestand durchgelaufen."); break }
}

sage(`ENDE. ${summe.gesehen} Punkte, ${summe.geschrieben} Angaben geschrieben, ${summe.verworfen} von den Riegeln abgewiesen.`)
process.exit(0)
