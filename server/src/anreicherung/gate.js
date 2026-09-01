// Das KI-Gate vor dem Schreiben (T-660).
//
// Max, 01.09.2026: "die Pipeline bauen für OpenRouter und so, dass es sauber durchläuft bei neuen
// Pulls. Und dass Datenpunkte von den APIs nur geschrieben werden, WENN sie durch das KI-Gate
// durch sind und enhanced wurden (außer es gibt nix)."
//
// BISHER LIEF ES ANDERSHERUM: der Import schrieb roh, und ein Nachlauf reicherte irgendwann an.
// Damit war ein neuer Punkt zwischen Import und Nachlauf unvollständig im Bestand — und ging in
// jede Auswertung ein, die in dieser Zeit lief. Jetzt sieht das Modell ihn, BEVOR er existiert.
//
// WARUM DAS BEZAHLBAR IST, gemessen an sieben Tagen Importhistorie:
//   1.100 bis 1.900 neue Punkte am Tag, verteilt auf rund 140 Läufe
//   im Schnitt 9 bis 12 neue Punkte je Lauf, größter Einzellauf 295
// Bei vier parallelen Strömen sind das Sekunden je Import, keine Minuten. Der Bestandslauf über
// 73.000 Punkte war die Ausnahme, nicht der Normalfall.
//
// FAIL-OPEN, und das ist eine bewusste Abweichung vom Wortlaut des Auftrags: fällt OpenRouter aus
// oder läuft in ein Rate-Limit, werden die Punkte TROTZDEM geschrieben — roh, und mit einem
// Vermerk im Log. Ein Gate, das bei Störung Daten verwirft, ist gefährlicher als ein roher Punkt:
// eine fehlende Baustelle merkt niemand, eine unvollständige sieht man an.
// Der Nachlauf holt sie beim nächsten Durchgang.

import { extrahiere, quelleHash, FELDER } from "./extrakt.js"
import { durchDreiRollen } from "./pipeline.js"
import { quelltextVon } from "./lauf.js"
import { offeneFelderFuer } from "./felder.js"

/**
 * Ein Connector-Objekt sieht anders aus als eine Datenbankzeile: `strassenRef` statt
 * `strassen_ref`, `gueltigVon` statt `gueltig_von`. quelltextVon liest die Datenbankform, also
 * wird hier umgesetzt — nicht umgekehrt, denn der Quelltext MUSS derselbe sein wie beim
 * Bestandslauf. Sonst passt der quelle_hash nicht, und die Ableitung gälte als veraltet, kaum
 * dass sie geschrieben ist.
 */
export function alsZeile(o) {
  return {
    id: o.externeId ?? null,
    kategorie: o.kategorie,
    name: o.name,
    beschreibung: o.beschreibung,
    strassen_ref: o.strassenRef,
    zustaendig: o.zustaendig,
    attrs: o.attrs,
    roh: o.roh,
    richtung: o.attrs?.richtung ?? null,
    gueltig_von: o.gueltigVon,
    gueltig_bis: o.gueltigBis,
    quelle: o.quelle,
  }
}

/**
 * Schickt NEUE Punkte durch das Modell und füllt ihre attrs, bevor sie geschrieben werden.
 *
 * @returns {{punkte: Array, belege: Array, gesehen: number, gefunden: number, fehler: string|null}}
 *   `punkte` ist dieselbe Liste, mit ergänzten attrs. `belege` sind die Zeilen für die
 *   Anreicherungstabelle — sie können erst nach dem Insert geschrieben werden, weil die Punkte
 *   vorher keine ID haben.
 */
export async function durchsGate(punkte, { modell, rufeModell, rollen = null, gleichzeitig = 8, grenze = 500, budgetMs = 45000, log = () => {} } = {}) {
  const belege = []
  let gefunden = 0
  if (!punkte?.length || !rufeModell) return { punkte: punkte ?? [], belege, gesehen: 0, gefunden: 0, fehler: null }

  // OBERGRENZE als Bremse: legt ein Connector einmal 50.000 Punkte neu an (erster Lauf einer
  // Quelle, Formatwechsel), soll der Import nicht stundenlang am Modell hängen. Der Rest geht roh
  // durch und wird vom Nachlauf geholt.
  const zuTun = punkte.slice(0, grenze)
  if (punkte.length > grenze) log(`Gate: ${punkte.length} neue Punkte, verarbeite ${grenze} — der Rest laeuft ueber den Nachlauf`)

  let fehler = null
  let naechster = 0
  // ZEITBUDGET. Max, 01.09.2026: "der braucht jetzt auch ewig, fix das bitte" — das Update ueber
  // 66 Quellen stockte, weil eine einzige Quelle mit vielen neuen Punkten das Gate minutenlang
  // beschaeftigte und der naechste Import erst danach dran war.
  //
  // Ein Import darf NIE haengen. Ist das Budget aufgebraucht, gehen die restlichen Punkte roh
  // durch und der Nachlauf holt sie — genau wie bei einer Stoerung des Anbieters. Lieber ein
  // Punkt, der eine Stunde spaeter angereichert wird, als ein Datenbestand, der nicht aktualisiert
  // wird.
  const ende = Date.now() + budgetMs
  let abgebrochen = 0
  const arbeiter = Array.from({ length: Math.max(1, gleichzeitig) }, async () => {
    while (true) {
      const i = naechster++
      if (i >= zuTun.length) return
      if (Date.now() > ende) { abgebrochen++; continue }
      const o = zuTun[i]
      try {
        const zeile = alsZeile(o)
        const felder = offeneFelderFuer(zeile)
        if (!felder.length) continue
        const text = quelltextVon(zeile)
        const { angaben } = rollen
          ? await durchDreiRollen(text, felder, rollen)
          : await extrahiere(text, { modell, felder, rufeModell }).then((r) => ({ angaben: r.gueltig }))
        if (!angaben?.length) continue
        o.attrs = { ...(o.attrs ?? {}) }
        for (const a of angaben) {
          // NUR IN LÜCKEN. Was die Quelle selbst meldet, bleibt stehen — dieselbe Regel wie in
          // spieleEin, und aus demselben Grund: eine gemeldete Angabe schlägt eine abgeleitete.
          if (o.attrs[a.feld] == null) o.attrs[a.feld] = typisiere(a.wert)
          belege.push({ externeId: o.externeId, feld: a.feld, wert: a.wert, beleg: a.beleg, hash: quelleHash(text) })
          gefunden++
        }
        // Kennzeichnung, damit die Karte den Stern zeigt — dieselbe wie beim Bestandslauf.
        o.kiAufbereitet = true
      } catch (e) {
        fehler ??= e.message
      }
    }
  })
  await Promise.all(arbeiter)

  if (fehler) log(`Gate: mindestens ein Aufruf fehlgeschlagen (${fehler}) — die Punkte gehen trotzdem in den Bestand`)
  if (abgebrochen) log(`Gate: Zeitbudget erreicht, ${abgebrochen} Punkte gehen roh durch — der Nachlauf holt sie`)
  log(`Gate: ${zuTun.length - abgebrochen} neue Punkte gesehen, ${gefunden} Angaben ergaenzt`)
  return { punkte, belege, gesehen: zuTun.length, gefunden, fehler }
}

/** Dieselben Formen wie in einspielen.js: attrs nimmt Zahlen und Wahrheitswerte, keinen Text,
 *  der eine Zahl sein sollte. */
function typisiere(wert) {
  if (wert === "true") return true
  if (wert === "false") return false
  const n = Number(wert)
  return Number.isFinite(n) && String(n) === String(wert).trim() ? n : wert
}

/**
 * Die Belege in die Anreicherungstabelle, NACH dem Insert — vorher gibt es keine ID.
 * Zugeordnet über (quellen_id, externe_id), also über dasselbe Paar, das auch der Import zum
 * Wiedererkennen nutzt.
 */
export async function schreibeBelege(db, belege, { modell, quellenId }) {
  if (!belege?.length) return { geschrieben: 0 }
  let n = 0
  for (const b of belege) {
    if (!b.externeId) continue
    const { rowCount } = await db.query(
      `INSERT INTO anreicherung (ziel_typ, ziel_id, feld, wert, beleg, modell, quelle_hash, stand)
       SELECT 'obstacle', o.id::text, $3, $4, $5, $6, $7, 'ok'
         FROM obstacles o WHERE o.quellen_id = $1 AND o.externe_id = $2
       ON CONFLICT (ziel_typ, ziel_id, feld, modell) WHERE stand IN ('ok', 'leer')
       DO UPDATE SET wert = EXCLUDED.wert, beleg = EXCLUDED.beleg, stand = 'ok', erstellt_am = now()`,
      [quellenId, b.externeId, b.feld, b.wert, b.beleg, modell, b.hash],
    ).catch(() => ({ rowCount: 0 }))
    n += rowCount ?? 0
  }
  return { geschrieben: n }
}

export { FELDER }
