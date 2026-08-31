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

import { extrahiere, quelleHash, FELDER } from "./extrakt.js"

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
  if (o.strassen_ref) teile.push(`Straßenangabe: ${o.strassen_ref}`)
  if (o.zustaendig) teile.push(`Zuständig: ${o.zustaendig}`)
  if (o.kategorie) teile.push(`Art: ${o.kategorie}`)
  const attrs = o.attrs && typeof o.attrs === "object" ? o.attrs : null
  if (attrs && Object.keys(attrs).length) teile.push(`Vorhandene Angaben: ${JSON.stringify(attrs)}`)
  if (o.roh) teile.push(`Ursprungsdaten der Quelle:\n${typeof o.roh === "string" ? o.roh : JSON.stringify(o.roh, null, 1)}`)
  return teile.join("\n")
}

/** Welche Felder fehlen an diesem Punkt noch? Was die Quelle schon sagt, wird nicht gefragt —
 *  das spart Aufrufe und verhindert, dass ein Modell eine gemeldete Angabe „korrigiert". */
export function offeneFelder(o) {
  const attrs = o.attrs && typeof o.attrs === "object" ? o.attrs : {}
  return Object.keys(FELDER).filter((f) => attrs[f] == null)
}

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
export async function reichereAn(db, o, { modell, rufeModell }) {
  const felder = offeneFelder(o)
  if (!felder.length) return { uebersprungen: true, geschrieben: 0, verworfen: 0 }

  const text = quelltextVon(o)
  const hash = quelleHash(text)
  const { gueltig, verworfen } = await extrahiere(text, { modell, felder, rufeModell })

  const gefunden = new Map(gueltig.map((g) => [g.feld, g]))
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
export async function laufeUeberBestand(db, { modell, rufeModell, grenze = 500, kategorien = null, beiFortschritt = null }) {
  const wo = kategorien?.length ? `AND o.kategorie = ANY($2)` : ""
  const werte = kategorien?.length ? [modell, kategorien] : [modell]
  // Kandidaten: alles, was noch KEINE Zeile dieses Modells hat. Der Verbund über die
  // Anreicherungstabelle macht den Lauf wiederaufnehmbar, ohne dass irgendwo ein Zeiger steht.
  const { rows } = await db.query(
    `SELECT o.id, o.kategorie, o.name, o.beschreibung, o.strassen_ref, o.zustaendig, o.attrs, o.roh
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
    const r = await reichereAn(db, o, { modell, rufeModell })
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
