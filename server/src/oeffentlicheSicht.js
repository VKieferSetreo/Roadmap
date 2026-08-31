// Welche Strecken der Kunde sieht — und warum er von den anderen NICHTS merkt (T-650).
//
// Max, 31.08.2026: "unter Strecke veröffentlichen will ich auswählen können mit einfachem
// Anticken welche der Strecken im Projekt tatsächlich public sein sollen und welche nicht.
// Ebenfalls sollen ausgeblendete Strecken beim Kunden auch ausgeblendet sein und er soll
// nicht sehen, dass was ausgeblendet worden ist."
//
//
// DER ZWEITE SATZ IST DER SCHWIERIGE
//
// Eine Strecke wegzulassen ist eine Zeile Code. Sie SPURLOS wegzulassen ist die eigentliche
// Arbeit, denn eine ausgeblendete Strecke hinterlaesst vier verschiedene Abdruecke:
//
//   1. die Strecke selbst in der Liste          — offensichtlich
//   2. Befunde, die auf ihr liegen              — ein Fund ohne Strecke schwebt im Nichts
//   3. Streckennamen an Funden, die auf MEHREREN Strecken liegen ("auch auf: Variante B")
//   4. die Gesamtlaenge und die Fahrzeit        — 340 km Summe bei 120 km sichtbarer Strecke
//
// Jeder einzelne verraet, dass da noch etwas ist. Diese Datei nimmt alle vier weg.
//
// WAS BEWUSST NICHT PASSIERT: eine Meldung wie "2 Strecken ausgeblendet". Genau die wollte
// Max nicht. Wer die Kundenansicht oeffnet, sieht ein vollstaendiges, in sich stimmiges
// Projekt — nur eben ein kleineres.
//
//
// DIE VOREINSTELLUNG IST "SICHTBAR"
//
// `oeffentlich !== false` und nicht `oeffentlich === true`: alle bestehenden Strecken haben
// das Feld nicht, und ein bereits geteiltes Projekt darf durch dieses Update nicht ploetzlich
// leer werden. Ausgeblendet ist nur, was ausdruecklich abgewaehlt wurde.

const ERDRADIUS_KM = 6371

/** Laenge einer Punktfolge in Kilometern. */
function laengeKm(points) {
  const p = Array.isArray(points) ? points : []
  let km = 0
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]
    const b = p[i]
    if (!Number.isFinite(a?.lat) || !Number.isFinite(b?.lat)) continue
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const m = Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    km += 2 * ERDRADIUS_KM * Math.asin(Math.min(1, Math.sqrt(m)))
  }
  return km
}

/** Ist diese Strecke fuer den Kunden sichtbar? */
export const istOeffentlich = (route) => route?.oeffentlich !== false

/** Die sichtbaren Strecken eines Projekts. */
export const oeffentlicheRouten = (routes) => (Array.isArray(routes) ? routes : []).filter(istOeffentlich)

/**
 * Die Befunde, die der Kunde sehen darf — und in der Form, in der er sie sehen darf.
 *
 * DREI FAELLE, und der mittlere ist der, den man uebersieht:
 *
 *   Fund liegt NUR auf sichtbaren Strecken   → unveraendert
 *   Fund liegt auf sichtbaren UND verborgenen → bleibt, aber die verborgenen Strecken
 *                                               verschwinden aus routeIds und aus routeName
 *   Fund liegt NUR auf verborgenen Strecken  → faellt weg
 *
 * Ohne den mittleren Fall stuende beim Kunden "auch auf: Variante B (gesperrt)" an einem
 * Fund, waehrend es in seiner Streckenliste keine Variante B gibt. Das ist genau der
 * Abdruck, den es nicht geben soll.
 *
 * Ein Fund OHNE Streckenbezug (routeId und routeIds leer) bleibt: er haengt an keiner
 * ausgeblendeten Strecke und kann sie darum auch nicht verraten.
 */
export function oeffentlicheFunde(findings, routes) {
  const sichtbar = new Set(oeffentlicheRouten(routes).map((r) => r?.id).filter(Boolean))
  const alle = new Set((Array.isArray(routes) ? routes : []).map((r) => r?.id).filter(Boolean))
  const raus = []
  for (const f of Array.isArray(findings) ? findings : []) {
    const bezuege = [...new Set([f?.routeId, ...(Array.isArray(f?.routeIds) ? f.routeIds : [])].filter(Boolean))]
    // Bezuege auf Strecken, die es im Projekt gar nicht (mehr) gibt, zaehlen nicht mit: sonst
    // haengt ein Altbestand-Fund an einer geloeschten Strecke und faellt hier faelschlich weg.
    const bekannte = bezuege.filter((id) => alle.has(id))
    if (!bekannte.length) {
      raus.push(f)
      continue
    }
    const uebrig = bekannte.filter((id) => sichtbar.has(id))
    if (!uebrig.length) continue // liegt ausschliesslich auf Verborgenem

    const gekuerzt = { ...f }
    // Der Repraesentant muss eine SICHTBARE Strecke sein — km und Position beziehen sich auf ihn.
    if (!sichtbar.has(gekuerzt.routeId)) gekuerzt.routeId = uebrig[0]
    if (Array.isArray(gekuerzt.routeIds)) {
      const ids = gekuerzt.routeIds.filter((id) => sichtbar.has(id))
      // Dieselbe Regel wie beim Erzeugen (siehe rowToFinding): unter zwei Strecken traegt
      // routeId die Auskunft allein, und routeIds waere nur Wiederholung.
      if (ids.length > 1) gekuerzt.routeIds = ids
      else delete gekuerzt.routeIds
    }
    // Der Name gehoert zum Repraesentanten. Zeigt er auf eine verborgene Strecke, muss er weg
    // — der Aufrufer setzt ihn aus der sichtbaren Streckenliste neu.
    if (gekuerzt.routeName && !sichtbar.has(f?.routeId)) delete gekuerzt.routeName
    raus.push(gekuerzt)
  }
  return raus
}

/**
 * Gesamtlaenge und Fahrzeit fuer die sichtbaren Strecken.
 *
 * WARUM NICHT EINFACH DIE GESPEICHERTEN WERTE: projects.distanz_km und fahrzeit_min stammen
 * aus der Analyse ueber ALLE Strecken. Bei drei von fuenf sichtbaren Strecken stuenden dort
 * 340 km, waehrend die Karte 120 km zeigt. Der Kunde muesste nicht rechnen koennen, um zu
 * merken, dass etwas fehlt.
 *
 * Die Laenge wird deshalb aus den sichtbaren Punktfolgen gerechnet. Die Fahrzeit laesst sich
 * so nicht rechnen — sie kommt aus dem Router und kennt Tempolimits. Sie wird im VERHAELTNIS
 * der Laengen skaliert. Das ist eine Naeherung, und sie ist hier zulaessig, weil sie nur eine
 * Anzeige betrifft und die Alternative (Feld weglassen) selbst ein Abdruck waere.
 *
 * Sind alle Strecken sichtbar, bleiben die gespeicherten Werte unangetastet. Der Regelfall
 * aendert sich also nicht.
 */
export function oeffentlicheKennzahlen(routes, { distanzKm, fahrzeitMin } = {}) {
  const alle = Array.isArray(routes) ? routes : []
  const sichtbar = oeffentlicheRouten(alle)
  if (sichtbar.length === alle.length) return { distanzKm, fahrzeitMin }

  const kmGesamt = alle.reduce((s, r) => s + laengeKm(r?.points), 0)
  const kmSichtbar = sichtbar.reduce((s, r) => s + laengeKm(r?.points), 0)
  const anteil = kmGesamt > 0 ? kmSichtbar / kmGesamt : 0

  return {
    distanzKm: distanzKm == null ? undefined : Math.round(Number(distanzKm) * anteil),
    fahrzeitMin: fahrzeitMin == null ? undefined : Math.round(Number(fahrzeitMin) * anteil),
  }
}
