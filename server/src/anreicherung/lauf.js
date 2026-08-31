// Der Bestandslauf: alle Hindernisse einmal durch das Modell (T-657).
//
// Max, 31.08.2026: "einmal über alle machen, die wir jetzt gerade haben, da kannst du die
// Workstation für benutzen, um das mehrere Tage laufen zu lassen mit nem 7b Modell oder so, und
// für zukünftige OpenRouter" — "und der KI immer den gesamten API-Abruf für den Punkt geben,
// dass sie alles extrahieren kann, was sie sieht."
//
// WIEDERAUFNEHMBAR, weil "mehrere Tage" heißt: der Rechner wird zwischendurch neu starten, das
// Netz wird wegbrechen, jemand wird Strg-C drücken. Der Fortschritt steht deshalb nach JEDEM
// Datensatz in der Datenbank, nicht am Ende. Ein Neustart überspringt, was schon dasteht, und
// kostet nichts. Es gibt bewusst keine Fortschrittsdatei: die wäre der eine Zustand, der beim
// Absturz fehlt.
//
// NICHT IM APP-CONTAINER STARTEN. Ein Deploy tauscht den Container und nimmt den Lauf mit —
// das ist in diesem Projekt schon zweimal passiert. Der Lauf gehört in ein eigenes
// `docker run --rm`, das ein Deploy nicht anfasst.

import { extrahiere, quelleHash, pruefeAngabe, FELDER } from "./extrakt.js"
import { durchDreiRollen } from "./pipeline.js"
import { strasseAusName } from "../external/osrm.js"
import { offeneFelderFuer } from "./felder.js"

/**
 * Alles, was wir über einen Punkt wissen, als EIN Text für das Modell.
 *
 * Warum der ganze Datensatz und nicht nur der Name: Max' Vorgabe, und sie ist richtig. Die
 * Durchfahrtshöhe steht bei manchen Quellen im Namen, bei anderen in der Beschreibung, bei
 * dritten in einem Attribut, das niemand ausgewertet hat. Was das Modell nicht sieht, kann es
 * nicht lesen.
 *
 * `roh` ist die ungekürzte Antwort der Quelle. Sie steht heute bei keinem Punkt (die Spalte
 * existiert, wird aber von keinem Connector befüllt) und ist deshalb optional — sobald sie
 * kommt, fließt sie ohne weitere Änderung mit ein.
 */
export function quelltextVon(o) {
  const teile = []
  if (o.name) teile.push(`Bezeichnung: ${o.name}`)
  if (o.beschreibung) teile.push(`Beschreibung: ${o.beschreibung}`)
  // BEWUSST so benannt und nicht "Straßenangabe": das Feld sagt, WO der Punkt liegt, nicht ob
  // er die Straße traegt oder kreuzt. Als "Straßenangabe: B65" gelesen, schloss das Modell
  // daraus die getragene Strasse — bei einer Ueberfuehrung UEBER die B65 waere das genau
  // verkehrt. Der Belegriegel kann das nicht abfangen, weil die Zeile ja wirklich dasteht;
  // die Formulierung muss den Fehlschluss verhindern.
  // Die Warnung gilt NUR fuer dieses eine Feld, deshalb steht sie direkt daneben und nicht als
  // allgemeine Regel im Auftrag: in der ersten Fassung hinderte sie das Modell auch daran, die
  // Strasse aus dem NAMEN zu lesen ("Bruecke St 2148 BW 6840513" lieferte nichts, obwohl ST2148
  // dort steht). Der Name bleibt eine gueltige Quelle, nur dieses Feld ist es nicht.
  if (o.strassen_ref) teile.push(`Verortet an: ${o.strassen_ref} (nur der Ort, keine Aussage über oben/unten)`)
  if (o.zustaendig) teile.push(`Zuständig: ${o.zustaendig}`)
  if (o.kategorie) teile.push(`Art: ${o.kategorie}`)
  // Alles weitere, was im Bestand steht und bisher ungenutzt blieb (Max: "gib ihm ALLE Felder").
  // richtung traegt bei allen 73.152 Punkten einen Wert, gueltig_von bei der Haelfte.
  if (o.richtung) teile.push(`Richtung: ${o.richtung}`)
  if (o.gueltig_von || o.gueltig_bis) teile.push(`Gültig: ${o.gueltig_von ?? "?"} bis ${o.gueltig_bis ?? "?"}`)
  if (o.quelle) teile.push(`Quelle: ${typeof o.quelle === "string" ? o.quelle : JSON.stringify(o.quelle)}`)
  const attrs = o.attrs && typeof o.attrs === "object" ? o.attrs : null
  if (attrs && Object.keys(attrs).length) teile.push(`Vorhandene Angaben: ${JSON.stringify(attrs)}`)
  if (o.roh) teile.push(`Ursprungsdaten der Quelle:\n${typeof o.roh === "string" ? o.roh : JSON.stringify(o.roh, null, 1)}`)
  return teile.join("\n")
}

/** Welche Felder fehlen an diesem Punkt noch? Was die Quelle schon sagt, wird nicht gefragt —
 *  das spart Aufrufe und verhindert, dass ein Modell eine gemeldete Angabe „korrigiert". */
export const offeneFelder = offeneFelderFuer

const SQL_MERKEN = `
  INSERT INTO anreicherung (ziel_typ, ziel_id, feld, wert, beleg, modell, quelle_hash, stand)
  VALUES ('obstacle', $1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (ziel_typ, ziel_id, feld, modell)
  DO UPDATE SET wert = EXCLUDED.wert, beleg = EXCLUDED.beleg,
                quelle_hash = EXCLUDED.quelle_hash, stand = EXCLUDED.stand, erstellt_am = now()`

/**
 * Ein Punkt. Schreibt für JEDES offene Feld eine Zeile — auch für die, zu denen das Modell
 * nichts gefunden hat (stand='leer'). Ohne diese Leerzeilen liefe der nächste Durchgang
 * dieselben Datensätze noch einmal an, und ein Lauf über 73.000 Punkte käme nie zum Ende.
 */
export async function reichereAn(db, o, { modell, rufeModell, rollen = null }) {
  const felder = offeneFelder(o)
  if (!felder.length) return { uebersprungen: true, geschrieben: 0, verworfen: 0 }

  const text = quelltextVon(o)
  const hash = quelleHash(text)
  // Drei Rollen statt einer, sobald mehr als ein Modellzugang da ist. Gemessen an 15 textreichen
  // Baustellen: 14 Angaben einstufig gegen 20 dreistufig, also gut 40 Prozent mehr, bei
  // gleichbleibender Strenge (die Riegel gelten fuer alle Rollen).
  const { angaben: gueltig, spur } = rollen
    ? await durchDreiRollen(text, felder, rollen)
    : await extrahiere(text, { modell, felder, rufeModell }).then((r) => ({ angaben: r.gueltig, spur: { verworfen: r.verworfen.length } }))
  const verworfen = { length: spur?.verworfen ?? 0 }

  const gefunden = new Map(gueltig.map((g) => [g.feld, g]))

  // REGEL ALS RUECKFALL (Max, 31.08.2026: "wenn die KI nix findet, dann nehmen wir Regel als
  // Fallback, definitiv"). Bei Bauwerken liest strasseAusName die Lage aus dem Namen, mit
  // gemessenen 94 Prozent Genauigkeit, und ist dort dem Modell ueberlegen: an 25 Ueberfuehrungen
  // fand das Modell keine einzige getragene Strasse, obwohl sie im Namen stand.
  //
  // Nur wo das Modell schweigt, nie gegen es: hat es geantwortet, hat es den ganzen Datensatz
  // gesehen und nicht nur den Namen.
  if (o.kategorie === "bruecke" || o.kategorie === "tunnel") {
    const ausName = strasseAusName(o.name)
    for (const [feld, wert] of [["getrageneStrasse", ausName.oben], ["gekreuzteStrasse", ausName.unten]]) {
      if (wert == null || gefunden.has(feld) || !felder.includes(feld)) continue
      // Auch die Regel muss belegen: der Name IST der Beleg, und er steht im Quelltext.
      const p = pruefeAngabe({ feld, wert, beleg: String(o.name ?? "") }, text)
      if (p.ok) gefunden.set(feld, { ...p, ausRegel: true })
    }
  }
  for (const feld of felder) {
    const g = gefunden.get(feld)
    await db.query(SQL_MERKEN, [
      o.id, feld, g?.wert ?? null, g?.beleg ?? null, modell, hash, g ? "ok" : "leer",
    ])
  }
  return { uebersprungen: false, geschrieben: gueltig.length, verworfen: verworfen.length, verwerfungen: verworfen }
}

/**
 * Der Lauf. `grenze` begrenzt einen Durchgang, damit man ihn erst klein ausprobieren kann.
 * `beiFortschritt` wird nach jedem Punkt gerufen — ein Lauf über Tage muss von außen sichtbar sein.
 */
export async function laufeUeberBestand(db, { modell, rufeModell, rollen = null, grenze = 500, kategorien = null, beiFortschritt = null }) {
  const wo = kategorien?.length ? `AND o.kategorie = ANY($2)` : ""
  const werte = kategorien?.length ? [modell, kategorien] : [modell]
  // Kandidaten: alles, was noch KEINE Zeile dieses Modells hat. Der Verbund über die
  // Anreicherungstabelle macht den Lauf wiederaufnehmbar, ohne dass irgendwo ein Zeiger steht.
  const { rows } = await db.query(
    `SELECT o.id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig, o.attrs, o.roh,
              o.richtung, o.gueltig_von, o.gueltig_bis, o.quelle
       FROM obstacles o
      WHERE o.aktiv = true ${wo}
        AND NOT EXISTS (
          SELECT 1 FROM anreicherung a
           WHERE a.ziel_typ = 'obstacle' AND a.ziel_id = o.id::text AND a.modell = $1)
      ORDER BY o.id
      LIMIT ${Number(grenze) || 500}`,
    werte,
  )

  const zahl = { gesehen: 0, geschrieben: 0, verworfen: 0, uebersprungen: 0 }
  for (const o of rows) {
    const r = await reichereAn(db, o, { modell, rufeModell, rollen })
    zahl.gesehen++
    if (r.uebersprungen) zahl.uebersprungen++
    zahl.geschrieben += r.geschrieben ?? 0
    zahl.verworfen += r.verworfen ?? 0
    if (beiFortschritt) beiFortschritt(zahl, o, r)
  }
  return { ...zahl, rest: rows.length === Number(grenze) }
}

/**
 * Die Gegenprobe, und der Grund, warum man diesem Lauf überhaupt trauen darf.
 *
 * Bei den Punkten, die die Quelle SELBST schon beantwortet, ist die Wahrheit bekannt. Lässt man
 * das Modell dieselben Felder trotzdem lesen und vergleicht, bekommt man eine gemessene
 * Trefferquote statt eines guten Gefühls. Fällt sie unter das, was der deterministische
 * Namensleser ohnehin schafft (94 Prozent, T-653), ist der ganze Aufwand nicht gerechtfertigt.
 */
export async function messeGuete(db, { modell, rufeModell, feld = "getrageneStrasse", anzahl = 60 }) {
  const { rows } = await db.query(
    `SELECT id, kategorie, name, beschreibung, strassen_ref, zustaendig, attrs, roh
       FROM obstacles
      WHERE aktiv = true AND attrs ? $1
      ORDER BY id
      LIMIT ${Number(anzahl) || 60}`,
    [feld],
  )
  let treffer = 0, daneben = 0, stumm = 0
  const fehler = []
  for (const o of rows) {
    const wahr = FELDER[feld].pruefe(o.attrs?.[feld])
    if (wahr == null) continue
    const text = quelltextVon({ ...o, attrs: { ...o.attrs, [feld]: undefined } })
    const { gueltig } = await extrahiere(text, { modell, felder: [feld], rufeModell })
    const g = gueltig.find((x) => x.feld === feld)
    if (!g) { stumm++; continue }
    if (String(g.wert) === String(wahr)) treffer++
    else { daneben++; if (fehler.length < 10) fehler.push({ name: o.name?.slice(0, 50), geraten: g.wert, wahr: String(wahr), beleg: g.beleg?.slice(0, 40) }) }
  }
  const beantwortet = treffer + daneben
  return {
    geprueft: rows.length,
    stumm,
    treffer,
    daneben,
    praezision: beantwortet ? Math.round((1000 * treffer) / beantwortet) / 10 : null,
    fehler,
  }
}
