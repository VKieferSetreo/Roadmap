// Drei Rollen statt einer (T-657).
//
// Max, 31.08.2026: "lass schauen, dass wir Agent 1 haben, der baut, Agent 2, der verifiziert und
// ergänzt/abnimmt, und Agent 3, der Fehlerbehebungen und Plausi-Checks macht, die parallel
// laufen. Nach Agent 1 und Agent 2 kann eben durch Verwerfung Plausi-Agent kommen. Nach Agent 1
// Plausi rutscht es in Agent 2 mit Feedback aus Plausi. Plausi-Agent kann auch korrigieren."
//
//   LESER (1)  ──► Riegel ──┬─► angenommen ─┐
//                           │               ├─► PRUEFER (3, parallel) ─► ABNEHMER (2) ─► schreiben
//                           └─► verworfen ──┘
//
// WARUM DREI UND NICHT EINER: die Rollen widersprechen sich. Wer extrahiert, will finden; wer
// abnimmt, will zweifeln. In einem Prompt vereint gewinnt immer das Finden, und genau das
// erzeugt die Angaben, die hinterher niemand nachvollziehen kann. Getrennt kann jede Rolle ihre
// eigene Neigung haben.
//
// WAS DER PRUEFER ZUSAETZLICH KANN, und das ist Max' eigentlicher Punkt: er sieht auch die
// VERWORFENEN. Die deterministischen Riegel sind streng und irren sich messbar — sie warfen
// "vollsperrung = ja" weg, weil das Wort "ja" nicht im Beleg stand. Ein Prüfer, der den Text
// daneben liest, holt so etwas zurück, ohne dass die Riegel weich werden müssten.
//
// PARALLEL: Ollama läuft mit OLLAMA_NUM_PARALLEL=4. Der Prüfer arbeitet an einem Punkt, während
// der Leser schon am nächsten ist. Eine RTX 3090 lastet ein einzelner 7B-Strom nicht aus
// (gemessen 0 Prozent Auslastung bei 6,6 von 24 GB belegt).

import { extrahiere, pruefeAngabe, leseAntwort, FELDER } from "./extrakt.js"

/** Rolle 3, Teil A: sind die angenommenen Angaben plausibel? */
function pruefPromptAngenommen(quelltext, angaben) {
  const liste = angaben.map((a) => `- ${a.feld} = ${a.wert}   (Beleg: "${a.beleg}")`).join("\n")
  return `Du prüfst Angaben, die ein anderer Leser aus einem Text gezogen hat. Antworte NUR mit JSON.

Text:
"""
${quelltext}
"""

Behauptete Angaben:
${liste}

Prüfe jede Angabe:
- Steht sie wirklich so im Text?
- Ist das Feld richtig gewählt? (Eine Achslast ist nicht die Gesamtmasse. Eine Durchfahrtshöhe
  ist nicht die Bauwerkshöhe. Die getragene Straße liegt OBEN, die gekreuzte UNTEN.)
- Ist der Wert plausibel für diese Art von Angabe?

Antworte für jede Angabe mit "ok", "falsch" oder "korrigiert". Bei "korrigiert" gibst du das
richtige Feld und/oder den richtigen Wert an.

{"urteile": [{"feld": "...", "urteil": "ok|falsch|korrigiert", "grund": "kurz",
              "neuesFeld": "nur bei korrigiert", "neuerWert": "nur bei korrigiert"}]}`
}

/** Rolle 3, Teil B: wurde zu Unrecht verworfen? */
function pruefPromptVerworfen(quelltext, verworfen) {
  const liste = verworfen
    .map((v) => `- ${v.angabe?.feld} = ${v.angabe?.wert}   (Beleg: "${v.angabe?.beleg}")   abgewiesen weil: ${v.grund}`)
    .join("\n")
  return `Ein automatischer Riegel hat Angaben abgewiesen. Prüfe, ob er sich geirrt hat.
Antworte NUR mit JSON.

Text:
"""
${quelltext}
"""

Abgewiesene Angaben:
${liste}

Erlaubte Felder: ${Object.keys(FELDER).join(", ")}

Für jede: steht die Angabe im Text und ist nur der Beleg oder das Feld schlecht gewählt? Dann
gib sie mit passendem Beleg und Feld erneut an. Steht sie NICHT im Text, lass sie weg.
Ein Beleg muss wörtlich aus dem Text stammen.

{"gerettet": [{"feld": "...", "wert": "...", "beleg": "..."}]}`
}

/**
 * Rolle 2: der ERGAENZER. Frueher war das die Abnahme, und sie hat messbar geschadet.
 *
 * Gemessen an 15 textreichen Baustellen: einstufig 15 Angaben, mit Abnahme 12. Der Abnehmer warf
 * Belegtes weg — er lehnte "halbseitig" bei einem Text ab, der woertlich "Halbseitige Sperrungen"
 * heisst. Das ist kein Prompt-Problem, sondern ein Rollenproblem: gefiltert haben vorher schon
 * drei deterministische Riegel UND der Pruefer. Ein viertes Nein bringt nichts mehr, es kostet nur.
 *
 * Max, 31.08.2026: "ueberleg dir, wie wir die Pipeline retten, dass wir maximalen Infogehalt aus
 * den Items rausbekommen." Also sucht diese Rolle jetzt, statt zu streichen: sie sieht, was schon
 * gefunden wurde, und geht den Text noch einmal nach dem durch, was FEHLT. Filtern bleibt Sache
 * der Regeln — die koennen nicht muede werden und begruenden ihr Nein nachvollziehbar.
 */
function ergaenzungsPrompt(quelltext, gefunden, felder) {
  const schon = gefunden.length ? gefunden.map((a) => `${a.feld} = ${a.wert}`).join(", ") : "noch nichts"
  const offen = felder.filter((f) => !gefunden.some((g) => g.feld === f))
  return `Ein erster Leser hat aus dem Text bereits Angaben gezogen. Du suchst, was er ÜBERSEHEN hat.
Antworte NUR mit JSON.

Text:
"""
${quelltext}
"""

Bereits gefunden: ${schon}

Noch offen, und nur danach suchst du:
${offen.map((f) => `- ${f}: ${FELDER[f].frage}`).join("\n")}

Regeln:
- Wiederhole nichts, was schon gefunden wurde.
- Gib ein Feld NUR an, wenn es im Text steht. Zu jedem gehört "beleg": die wörtliche Textstelle.
- Findest du nichts mehr, gib {"angaben": []} zurück.

{"angaben": [{"feld": "...", "wert": "...", "beleg": "..."}]}`
}

/**
 * Ein Punkt durch alle drei Rollen.
 *
 * @param {string} quelltext
 * @param {string[]} felder    offene Felder dieses Punkts
 * @param {object} rollen      {liest, prueft, nimmtAb} — je ein rufeModell. Dürfen dasselbe
 *                             Modell sein; getrennt, damit man dem Prüfer ein größeres geben kann.
 */
export async function durchDreiRollen(quelltext, felder, { liest, prueft, nimmtAb, ohnePruefer = false, ohneAbnahme = false }) {
  // ── Rolle 1: lesen ────────────────────────────────────────────────────────
  const { gueltig, verworfen } = await extrahiere(quelltext, { felder, rufeModell: liest })
  const spur = { gelesen: gueltig.length, verworfen: verworfen.length, gerettet: 0, korrigiert: 0, abgelehnt: 0, ergaenzt: 0 }
  if (ohnePruefer) return { angaben: gueltig, spur, hinweise: [] }

  // ── Rolle 3: prüfen — beide Teile PARALLEL, sie hängen nicht voneinander ab ──
  const [urteile, gerettet] = await Promise.all([
    gueltig.length
      ? prueft(pruefPromptAngenommen(quelltext, gueltig)).then((a) => leseAntwortListe(a, "urteile")).catch(() => null)
      : Promise.resolve([]),
    verworfen.length
      ? prueft(pruefPromptVerworfen(quelltext, verworfen)).then((a) => leseAntwortListe(a, "gerettet")).catch(() => null)
      : Promise.resolve([]),
  ])

  const hinweise = []
  let kandidaten = []

  // Urteile über die angenommenen anwenden. Ohne Antwort des Prüfers bleibt alles stehen:
  // ein ausgefallener Prüfer darf keine Angabe verschwinden lassen.
  const nachUrteil = new Map((urteile ?? []).map((u) => [u.feld, u]))
  for (const a of gueltig) {
    const u = nachUrteil.get(a.feld)
    if (!u || u.urteil === "ok") { kandidaten.push(a); continue }
    if (u.urteil === "falsch") { hinweise.push(`${a.feld} verworfen: ${u.grund ?? "vom Prüfer abgelehnt"}`); spur.abgelehnt++; continue }
    if (u.urteil === "korrigiert") {
      // Die Korrektur muss durch dieselben Riegel wie eine Erstangabe. Ein Prüfer, der frei
      // schreiben darf, wäre nur eine zweite Quelle für unbelegte Werte.
      const p = pruefeAngabe({ feld: u.neuesFeld ?? a.feld, wert: u.neuerWert ?? a.wert, beleg: a.beleg }, quelltext)
      // Eine Korrektur darf kein Feld doppeln: der Pruefer schlug mehrfach vor, zwei Angaben auf
      // DASSELBE Zielfeld zu schieben ("spurenGesperrt" zu "anzahlFahrstreifen", das schon stand).
      // Dann stuenden zwei Werte fuer ein Feld da, und keiner koennte sagen, welcher gilt.
      const belegt = kandidaten.some((k) => k.feld === p.feld)
      if (p.ok && !belegt) { kandidaten.push(p); spur.korrigiert++; hinweise.push(`${a.feld} korrigiert zu ${p.feld}=${p.wert}`) }
      else if (belegt) { hinweise.push(`Korrektur an ${a.feld} verworfen: ${p.feld} ist schon belegt`); spur.abgelehnt++ }
      else { kandidaten.push(a); hinweise.push(`Korrektur an ${a.feld} hielt der Prüfung nicht stand`) }
    }
  }

  // Gerettete: ebenfalls durch die Riegel, und nur, was noch fehlt.
  const schonDa = new Set(kandidaten.map((k) => k.feld))
  for (const g of gerettet ?? []) {
    if (schonDa.has(g.feld)) continue
    const p = pruefeAngabe(g, quelltext)
    if (p.ok) { kandidaten.push(p); schonDa.add(p.feld); spur.gerettet++; hinweise.push(`${p.feld} vom Prüfer zurückgeholt`) }
  }

  if (ohneAbnahme) return { angaben: kandidaten, spur, hinweise }

  // ── Rolle 2: ergänzen ─────────────────────────────────────────────────────
  // Läuft auch dann, wenn bisher NICHTS gefunden wurde — gerade dann lohnt der zweite Blick.
  const antwort = await nimmtAb(ergaenzungsPrompt(quelltext, kandidaten, felder)).catch(() => null)
  const nachgereicht = leseAntwortListe(antwort, "angaben") ?? []
  const belegt = new Set(kandidaten.map((k) => k.feld))
  for (const n of nachgereicht) {
    if (belegt.has(n.feld)) continue
    // Dieselben Riegel wie fuer die Erstangabe. Der Ergaenzer ist ein zweiter Leser, kein
    // zweiter Massstab.
    const p = pruefeAngabe(n, quelltext)
    if (p.ok) { kandidaten.push(p); belegt.add(p.feld); spur.ergaenzt = (spur.ergaenzt ?? 0) + 1; hinweise.push(`${p.feld} nachgereicht`) }
  }
  return { angaben: kandidaten, spur, hinweise }
}

function leseAntwortListe(text, schluessel) {
  const o = leseAntwortObjekt(text)
  return Array.isArray(o?.[schluessel]) ? o[schluessel] : null
}

/** Wie leseAntwort, nur ohne die Festlegung auf "angaben". */
function leseAntwortObjekt(text) {
  const roh = String(text ?? "").replace(/```(?:json)?/gi, "")
  const von = roh.indexOf("{")
  const bis = roh.lastIndexOf("}")
  if (von < 0 || bis <= von) return null
  try { return JSON.parse(roh.slice(von, bis + 1)) } catch { return null }
}

export { leseAntwortObjekt }
