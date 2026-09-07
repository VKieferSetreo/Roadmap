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
//
// ── WAS DER LAUF ANSIEHT ─────────────────────────────────────────────────────────────────────
//
// Max, 07.09.2026: "NUR NEUE PUNKTE seit letztem Pull analysieren, nicht alle."
//
// GEMESSEN am 07.09.2026 auf Prod, direkt nach dem Lauf, 77.629 aktive Punkte:
//
//   895      ohne Fertig-Marke            — neu (873 davon aus den letzten 48 Stunden)
//   7.749    Marke da, Quell-Hash anders  — die Quelle hat den Meldungstext geändert
//   68.985   Marke da, Hash passt         — fertig und aktuell
//
// Die Kandidatenwahl in lauf.js fragt NUR nach der Fertig-Marke. Neue Punkte tragen keine, sie
// sind also längst genau das, was Max verlangt. Was fehlte, ist die andere Hälfte: die 7.749
// GEÄNDERTEN trugen eine gültige Marke und wurden deshalb nie wieder angesehen — 5.221 von ihnen
// seit dem 02.09.2026. Der quelle_hash war von Anfang an dafür gedacht ("ändert die Quelle ihren
// Text, ist die Ableitung ungültig und wird neu gerechnet", migrations/068), und lauf.js sagt es
// als Zusage zu ("Quelltext geändert -> Marke wird mitgelöscht -> Kandidat"). Gelöscht hat die
// Marke nur nie jemand: anreicherungNachpruefen.mjs räumt bei geändertem Text die LEERMELDUNGEN
// weg und nimmt die Marke ausdrücklich aus (`feld <> '_fertig'`). Der Punkt blieb damit
// abgehakt. Diesen Abgleich holt der Lauf jetzt selbst nach, bevor er anfängt.
//
// STICHPROBE, ob die Änderungen echt sind: von 600 überholten Punkten liessen sich 83 (14 %)
// durch blosses Verschieben von gueltig_von/bis erklären, 517 nicht — dort steht wirklich ein
// anderer Meldungstext. Hochgerechnet rund 6.900 der 7.749. Der Abgleich jagt also keine
// Phantome. Betroffen sind Baustellen (13 %), Sperrungen (23 %) und Engstellen (47 %); Brücken
// und Gewichtsbeschränkungen liegen bei 0 %, wie es sich für Bauwerksdaten gehört.
//
// DIE REIHENFOLGE ergibt sich von selbst und ist genau die gewünschte:
//   1. neu        — trägt keine Marke, ist sofort Kandidat
//   2. überholt   — Marke wird in Scheiben abgeräumt, ÄLTESTE ZUERST
//   3. Altbestand — mit der Restzeit, ebenfalls älteste Marke zuerst, Kontingent je Lauf
//
// WARUM ES DEN DRITTEN SCHRITT BRAUCHT, obwohl nach 1 und 2 rechnerisch nichts offen ist: am
// 02.09.2026 hat eine Aufräumroutine die Leermeldungen von 61.274 Punkten gelöscht und ihre
// Marken stehen lassen. Heute tragen 65.547 aktive Punkte eine Marke ohne eine einzige Sachzeile
// — wir wissen nicht mehr, was dort gelesen wurde, nur dass es gelesen wurde. Solche Löcher
// entstehen wieder, und eine Auswahl, die ausschliesslich auf Neues schaut, sieht sie nie. Der
// Altbestandsschritt ist die Garantie, dass jeder Punkt irgendwann wieder drankommt: bei 1.000
// Punkten je Lauf ist der Bestand in rund 70 Tagen einmal umgewälzt, und er kostet nur Zeit, die
// sonst ungenutzt bliebe.
//
// ── WANN DER LAUF AUFHÖRT ────────────────────────────────────────────────────────────────────
//
// Max, 07.09.2026: "sauber durchlaufen, kein cutoff" — aber die Sicherung gegen einen hängenden
// Lauf muss bleiben, sonst belegt er die Grafikkarte tagelang.
//
// Eine feste Gesamtdauer kann das nicht leisten: sie trifft den langen Lauf genauso wie den
// hängenden. Am 07.09.2026 lief der Lauf gleichmässig mit 12 Punkten pro Minute und wurde nach
// 298 Minuten mitten in der Arbeit abgeschnitten. UNTERSCHEIDEN lassen sich die beiden nur am
// FORTSCHRITT, und der ist hier eindeutig messbar: gemessen an den 145 Fortschrittszeilen des
// Laufs vom 07.09.2026 lagen zwischen zwei fertigen Vierteln (25 Punkte) 81 s im besten und
// 176 s im schlechtesten Fall. Der Wächter unten schlägt nach 15 Minuten ohne einen einzigen
// fertigen Punkt an — das Fünffache des schlechtesten gemessenen Abstands und immer noch das
// Doppelte des schlimmsten Falls, den ein einzelner Punkt überhaupt bauen kann (drei Rollen à
// 120 s Zeitlimit, modell.js).
//
// In nachtlauf.sh steht daneben KEIN festes Zeitlimit mehr (Max, 07.09.2026: "lass das Ding
// rennen bis alles durch ist … aber nicht einfach abschneiden"). Statt einer Uhr wacht dort ein
// Lebenszeichen-Wächter: wächst das Logfile 30 Minuten lang nicht, hängt der Prozess so tief,
// dass nicht einmal mehr dieser Timer hier feuert — nur dann wird der Container gestoppt.
//
// RÜCKGABEWERTE, damit ein abgeschnittener Lauf nicht mehr wie ein fertiger aussieht (bis zum
// 07.09.2026 endete er IMMER mit 0, auch nach SIGTERM mitten im Bestand — nachtlauf.sh meldete
// daraufhin "fertig" und schwieg):
//   0 — durchgelaufen, es ist nichts mehr offen
//   2 — abgeschnitten: Signal oder Zeitlimit, es bleibt etwas offen
//   3 — hängt: seit ANREICHERUNG_STILL_MIN Minuten kein Punkt mehr fertig geworden
//   4 — kein Modell der Kette antwortet (T-736): Abbruch, damit nichts faelschlich als
//       bearbeitet gilt. Was bis dahin gefunden wurde, ist eingespielt.

import { pathToFileURL } from "node:url"
import { createDefaultDb } from "../src/db.js"
import { laufeUeberBestand, quellHashVon, FERTIG_FELD } from "../src/anreicherung/lauf.js"
import { FELDER } from "../src/anreicherung/extrakt.js"
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

// Nach so vielen Minuten ohne einen einzigen fertigen Punkt gilt der Lauf als haengend. Siehe
// die Messung oben: der schlechteste beobachtete Abstand zwischen zwei Fortschrittsmeldungen lag
// bei 176 s.
const STILL_MIN = Number(process.env.ANREICHERUNG_STILL_MIN || 15)
// Wie viele Punkte des ALTBESTANDS ein Lauf zusaetzlich anfasst, nachdem Neues und Ueberholtes
// durch sind. 1.000 sind bei gemessenen 12 Punkten/min rund 83 Minuten — genug, um den Bestand
// in gut zwei Monaten einmal umzuwaelzen, und wenig genug, dass ein Tag mit vielen echten
// Aenderungen davon nicht verdraengt wird. ANREICHERUNG_VOLLBESTAND=1 hebt die Grenze auf und
// laesst genau EINEN vollen Durchgang ueber alles laufen (Marken, die dieser Lauf selbst
// schreibt, kommen nicht noch einmal dran — siehe altbestandMarken).
const VOLLBESTAND = process.env.ANREICHERUNG_VOLLBESTAND === "1"
const ALTBESTAND = VOLLBESTAND ? Infinity : Number(process.env.ANREICHERUNG_ALTBESTAND ?? 1000)
// Der Hash-Abgleich laesst sich abschalten. Das ist kein Zierrat: aendert sich quellHashVon oder
// eine der Spalten, die hineingeht, gilt schlagartig der GANZE Bestand als ueberholt. Genau das
// ist am 02.09.2026 passiert (61.274 von 74.175 Punkten, weil attrs im Hash steckte). Deshalb
// zusaetzlich eine Obergrenze je Lauf: mehr als das kann kein realer Tag an Aenderungen bringen,
// und wenn doch, soll das im Log stehen und nicht die Karte fuer eine Woche binden.
const ABGLEICH = process.env.ANREICHERUNG_ABGLEICH !== "0"
const ABGLEICH_MAX = Number(process.env.ANREICHERUNG_ABGLEICH_MAX || 20000)
// In diesen Scheiben werden Marken abgeraeumt. Klein halten: was abgeraeumt, aber nicht mehr
// gerechnet wurde, ist morgen Kandidat, ohne dass sich der Quelltext geaendert haette. Zwei
// Bloecke sind der Rest, den ein Abbruch schlimmstenfalls stehen laesst.
const SCHEIBE = BLOCK * 2

const KATALOG_GROESSE = String(Object.keys(FELDER).length)

// ALLE Spalten, die quellHashVon liest — und keine andere. Wird hier eine vergessen, ist ihr
// Wert beim Nachrechnen undefined, der Hash weicht ab, und der Lauf haelt den halben Bestand
// fuer geaendert. Die Liste steht deshalb als Konstante da und wird in
// test/anreicherungLauf.test.js gegen quellHashVon selbst geprueft, Feld fuer Feld.
export const HASH_SPALTEN = [
  "name", "beschreibung", "strassen_ref", "zustaendig", "kategorie",
  "richtung", "gueltig_von", "gueltig_bis", "roh",
]

const zeit = () => new Date().toISOString().slice(11, 19)
const sage = (t) => console.log(`[${zeit()}] ${t}`)

/**
 * Welche Punkte tragen eine Fertig-Marke, die auf einem anderen Quelltext gebildet wurde?
 *
 * Der Hash wird in JS gerechnet und nicht in SQL — quellHashVon ist die einzige Stelle, die weiss,
 * WAS in den Hash gehoert, und eine zweite Fassung in SQL waere die naechste Quelle stiller
 * Abweichung. Gemessen auf Prod: 76.734 Marken laden 650 ms, das Hashen 312 ms. Das ist billig
 * genug, um es einmal je Lauf zu tun.
 *
 * ÄLTESTE ZUERST: die Reihenfolge entscheidet, was zuerst neu gelesen wird, wenn die Zeit nicht
 * fuer alles reicht. Ein Punkt, dessen Marke fuenf Tage alt ist, hat laenger falsch dagestanden
 * als einer von gestern.
 *
 * WICHTIG: db muss ueber createDefaultDb kommen. src/db.js setzt pg.types.setTypeParser(1082) und
 * liefert DATE-Spalten als "YYYY-MM-DD"-Text; ein roher pg.Pool liefert JS-Date, und dann weicht
 * der Hash bei jedem Punkt mit Gueltigkeitsfenster ab. Beim Messen am 07.09.2026 hat genau das
 * 29.286 Phantom-Aenderungen erzeugt.
 */
export async function ueberholteMarken(db, { modell, katalog = KATALOG_GROESSE }) {
  const { rows } = await db.query(
    `SELECT o.id, ${HASH_SPALTEN.map((s) => `o.${s}`).join(", ")},
            m.quelle_hash
       FROM obstacles o
       JOIN anreicherung m ON m.ziel_typ = 'obstacle' AND m.ziel_id = o.id::text
        AND m.feld = '${FERTIG_FELD}' AND m.modell = $1 AND m.wert = $2
      WHERE o.aktiv = true
      ORDER BY m.erstellt_am ASC`,
    [modell, katalog],
  )
  return {
    gepruefte: rows.length,
    ids: rows.filter((o) => quellHashVon(o) !== o.quelle_hash).map((o) => String(o.id)),
  }
}

/**
 * Die naechsten Punkte des Altbestands: aelteste Marke zuerst.
 *
 * `vor` ist der Startzeitpunkt des Laufs und der Grund, warum ein Vollbestandslauf endet statt
 * sich im Kreis zu drehen: jeder gerechnete Punkt bekommt eine frische Marke, und ohne diese
 * Schranke waere die frisch geschriebene Marke irgendwann selbst wieder die aelteste.
 *
 * Der Wert kommt aus der DATENBANKUHR (`SELECT now()`), nicht aus dem Container. Verglichen wird
 * er mit erstellt_am, und das setzt Postgres. Beide Uhren gehen heute gleich (gemessen 0 s
 * Versatz), aber ein Vergleich zweier Uhren, von denen eine nicht die schreibende ist, ist genau
 * die Art Annahme, die drei Monate haelt und dann still bricht.
 *
 * NUR AKTIVE PUNKTE. Eine Marke an einem inaktiven Punkt abzuraeumen brächte ihn nicht in die
 * Kandidatenwahl (die filtert auf aktiv = true) — dieselbe Zeile käme im nächsten Durchgang
 * wieder, und der Lauf träte auf der Stelle.
 */
export async function altbestandMarken(db, { modell, katalog = KATALOG_GROESSE, anzahl, vor }) {
  const { rows } = await db.query(
    `SELECT a.ziel_id
       FROM anreicherung a
       JOIN obstacles o ON o.id::text = a.ziel_id
      WHERE a.ziel_typ = 'obstacle' AND a.feld = '${FERTIG_FELD}'
        AND a.modell = $1 AND a.wert = $2
        AND o.aktiv = true
        AND a.erstellt_am < $3
      ORDER BY a.erstellt_am ASC
      LIMIT ${Number(anzahl) || 0}`,
    [modell, katalog, vor],
  )
  return rows.map((r) => String(r.ziel_id))
}

/**
 * Die Fertig-Marke abraeumen — mehr braucht es nicht, damit ein Punkt wieder Kandidat wird.
 *
 * NUR die Marke, nur dieses Modell. Alles andere in der Anreicherungstabelle ist Arbeitsergebnis
 * (Max, 31.08.2026: "alle abgewiesenen behalten"), und die 'ok'-Zeilen sind der Bestand selbst.
 * Die Marke dagegen ist reine Ablaufsteuerung und wird beim naechsten Lesen ohnehin neu
 * geschrieben. In Bloecken, damit der Parameter nicht ueber die Postgres-Grenze waechst.
 */
export async function raeumeMarken(db, { modell, ids }) {
  let weg = 0
  for (let i = 0; i < ids.length; i += 2000) {
    const r = await db.query(
      `DELETE FROM anreicherung
        WHERE ziel_typ = 'obstacle' AND feld = '${FERTIG_FELD}' AND modell = $1
          AND ziel_id = ANY($2::text[])`,
      [modell, ids.slice(i, i + 2000)],
    )
    weg += r.rowCount ?? 0
  }
  return weg
}

/** Wie viele Punkte warten noch auf diesen Lauf? Dieselbe Bedingung wie die Kandidatenwahl. */
export async function zaehleKandidaten(db, { modell, katalog = KATALOG_GROESSE }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM obstacles o
      WHERE o.aktiv = true
        AND NOT EXISTS (SELECT 1 FROM anreicherung a
                         WHERE a.ziel_id = o.id::text AND a.feld = '${FERTIG_FELD}'
                           AND a.modell = $1 AND a.wert = $2)`,
    [modell, katalog],
  )
  return rows[0]?.n ?? 0
}

async function main() {
  const konfig = modellKonfig(process.env.ANREICHERUNG_WEG || "lokal")
  const db = createDefaultDb()

  sage(`Modell ${konfig.name} über ${konfig.basis}, ${GLEICHZEITIG} Punkte gleichzeitig`)
  if (NUR_VERWERFUNGEN_VON) sage(`Zweite Runde: nur Punkte, an denen ${NUR_VERWERFUNGEN_VON} etwas abgewiesen hat.`)
  if (!(await erreichbar(konfig))) {
    sage("Modell nicht erreichbar — Abbruch, bevor irgendetwas geschrieben wird.")
    process.exit(1)
  }
  sage("Modell antwortet.")

  const gesamt = await db.query("SELECT count(*)::int AS n, now() AS jetzt FROM obstacles WHERE aktiv = true")
  sage(`${gesamt.rows[0].n} aktive Hindernisse im Bestand.`)
  // Die Uhr der Datenbank, nicht die des Containers — siehe altbestandMarken.
  const laufStart = gesamt.rows[0].jetzt

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

  // DER WÄCHTER GEGEN DEN HÄNGER. Er misst nicht die Dauer, sondern den Fortschritt: solange
  // Punkte fertig werden, darf der Lauf laufen, so lange er will. Kommt seit STILL_MIN Minuten
  // keiner mehr, ist er hängen geblieben und wird abgebrochen, damit die Karte frei wird.
  //
  // unref(), damit dieser Timer den Prozess am Ende nicht künstlich am Leben hält.
  //
  // Was dabei NICHT verloren geht: jeder fertige Block ist längst eingespielt (spieleEin läuft
  // nach jedem Block), und nachtlauf.sh spielt im trap noch einmal alles ein. Verloren ist
  // höchstens der angefangene Block, und dessen Punkte tragen keine Marke — der nächste Lauf
  // nimmt sie sich wieder.
  let letzterFortschritt = Date.now()
  const waechter = setInterval(() => {
    const stillMin = (Date.now() - letzterFortschritt) / 60000
    if (stillMin < STILL_MIN) return
    sage(`HÄNGT: seit ${Math.round(stillMin)} min ist kein Punkt mehr fertig geworden — Abbruch.`)
    sage(`  ${summe.gesehen} Punkte in diesem Lauf. Was gerechnet war, ist eingespielt;`)
    sage("  der angefangene Block hat keine Marke bekommen und kommt morgen wieder dran.")
    process.exit(3)
  }, 30_000)
  waechter.unref()

  // ── Abgleich: welche Marken sitzen auf geändertem Quelltext? ────────────────────────────────
  //
  // NICHT IN DER ZWEITEN RUNDE. Dort ist die Kandidatenmenge absichtlich auf Punkte mit
  // Verwerfungen des Vormodells beschränkt; Marken ausserhalb dieser Menge abzuräumen erzeugte
  // nur Kandidaten, die dieser Lauf gar nicht ansieht — und die morgen den regulären Lauf füllen.
  let ueberholtOffen = []
  if (ABGLEICH && !NUR_VERWERFUNGEN_VON) {
    const { gepruefte, ids } = await ueberholteMarken(db, { modell: konfig.name })
    ueberholtOffen = ids.slice(0, ABGLEICH_MAX)
    sage(`Abgleich: ${ids.length} von ${gepruefte} Fertig-Marken sitzen auf geändertem Quelltext.`)
    if (ids.length > ABGLEICH_MAX) {
      sage(`ACHTUNG: das sind mehr als die Obergrenze ${ABGLEICH_MAX} — es werden nur die`)
      sage("  ältesten davon neu gelesen. So viele Änderungen an einem Tag sprechen dafür, dass")
      sage("  sich der Hash geändert hat und nicht die Quelle. Bitte nachsehen.")
    }
  } else if (NUR_VERWERFUNGEN_VON) {
    sage("Abgleich übersprungen: die zweite Runde hat ihre eigene Auswahl.")
  }
  let altbestandRest = ALTBESTAND

  /**
   * Nachlegen, wenn die Kandidatenmenge leer ist: erst die überholten, dann der Altbestand.
   * Gibt zurück, wie viele Punkte freigeräumt wurden — 0 heisst "es ist wirklich nichts mehr da".
   */
  async function nachlegen() {
    if (ueberholtOffen.length) {
      const scheibe = ueberholtOffen.splice(0, SCHEIBE)
      await raeumeMarken(db, { modell: konfig.name, ids: scheibe })
      return { n: scheibe.length, woher: `überholt (noch ${ueberholtOffen.length})` }
    }
    if (!(altbestandRest > 0) || NUR_VERWERFUNGEN_VON) return { n: 0 }
    const ids = await altbestandMarken(db, {
      modell: konfig.name,
      anzahl: Math.min(SCHEIBE, altbestandRest),
      vor: laufStart,
    })
    if (!ids.length) return { n: 0 }
    await raeumeMarken(db, { modell: konfig.name, ids })
    altbestandRest -= ids.length
    const rest = altbestandRest === Infinity ? "unbegrenzt" : altbestandRest
    return { n: ids.length, woher: `Altbestand (Kontingent noch ${rest})` }
  }

  let durch = false
  while (laeuft) {
    // Auch der Abgleich und das Einspielen sind Fortschritt — sonst schlüge der Wächter an,
    // während der Lauf gerade ordentlich arbeitet.
    letzterFortschritt = Date.now()
    // T-736: ein Modellausfall kommt hier als Wurf an und bekommt einen EIGENEN Ausgang (4).
    // Ohne ihn liefe der Lauf mit einem gewoehnlichen Fehler aus, und nachtlauf.sh haette ihn
    // unter "Rueckgabewert N" gemeldet — richtig, aber nichtssagend. Wer die Mail liest, soll
    // sofort wissen, dass die Karte nicht antwortet und NICHT, dass die Daten kaputt sind.
    let r
    try {
      r = await laufeUeberBestand(db, {
      modell: konfig.name,
      rufeModell,
      rollen,
      grenze: BLOCK,
      gleichzeitig: GLEICHZEITIG,
      nurVerwerfungenVon: NUR_VERWERFUNGEN_VON,
      beiFortschritt: (z) => {
        letzterFortschritt = Date.now()
        if (z.gesehen % 25 === 0) {
          const proMin = Math.round((60000 * (summe.gesehen + z.gesehen)) / (Date.now() - start))
          sage(`  ${summe.gesehen + z.gesehen} Punkte, ${summe.geschrieben + z.geschrieben} Angaben gefunden, ${proMin}/min`)
        }
      },
      })
    } catch (err) {
      if (err?.name !== "ModellNichtErreichbar") throw err
      sage(`MODELL ANTWORTET NICHT: ${err.message}`)
      sage("Abbruch, damit keine Punkte faelschlich als bearbeitet gelten. Der naechste Lauf nimmt sie erneut.")
      // Was bis hierher geschafft wurde, ist echt und darf in den Bestand.
      const ein = await spieleEin(db, { modell: konfig.name }).catch(() => ({ aktualisiert: 0 }))
      sage(`Bis zum Abbruch eingespielt: ${ein.aktualisiert} Punkte, ${summe.geschrieben} Angaben.`)
      process.exit(4)
    }
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
    if (r.rest) continue
    if (!laeuft) break   // nach einem Signal nichts mehr freiräumen, was dieser Lauf nicht mehr rechnet
    const nach = await nachlegen()
    if (!nach.n) { sage("Bestand durchgelaufen. Nichts Neues, nichts Überholtes, Altbestand-Kontingent aufgebraucht."); durch = true; break }
    sage(`Nachgelegt: ${nach.n} Punkte aus ${nach.woher}`)
  }

  sage(`ENDE. ${summe.gesehen} Punkte, ${summe.geschrieben} Angaben geschrieben, ${summe.verworfen} von den Riegeln abgewiesen.`)
  // Die Zahl, an der man sieht, ob der Lauf hinterherkommt. Die noch nicht abgeräumten überholten
  // Marken zählen mit: sie sind offen, auch wenn sie in der Kandidatenabfrage noch nicht auftauchen.
  const offen = await zaehleKandidaten(db, { modell: konfig.name }).catch(() => null)
  if (offen != null) sage(`Noch offen: ${offen + ueberholtOffen.length} Punkte (neu oder überholt).`)
  process.exit(durch ? 0 : 2)
}

// Nur ausführen, wenn das Skript wirklich aufgerufen wurde. Beim Import aus einem Test bleibt es
// still, sonst würde jeder Testlauf eine Datenbankverbindung aufmachen und ein Modell anrufen.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
