// Aus „kritisch" wird eine Entscheidung.
//
// Die Bewertung liefert bisher nur einen Schweregrad. Ein Disponent unterscheidet aber
// drei Dinge, und erst diese Unterscheidung macht aus einer Fundliste eine Grundlage:
//
//   mit-auflagen        fahrbar, wenn etwas eingehalten wird (Alleinbenutzung,
//                       Schrittgeschwindigkeit, Begleitfahrzeug, Höhenkontrolle)
//   einzelfallpruefung  fahrbar erst nach einem VERFAHREN (Statik, Bauwerksprüfung).
//                       Das entscheidet über den TERMIN, nicht über die Auflage —
//                       solche Verfahren dauern Wochen bis Monate.
//   nicht-fahrbar       physisch oder rechtlich ausgeschlossen; hier hilft nur umfahren
//
// Warum das hier steht und nicht im Prompt: Der Agent hat sich die Einordnung sonst aus
// dem Modellwissen geholt („Standard-Durchfahrtshöhen liegen bei 4,5–4,8 m") — das klingt
// fachkundig und ist unbelegt. Hier leitet sie sich aus denselben Attributen ab, die auch
// den Schweregrad bestimmen.
//
// ACHTUNG: fachliche Orientierung, keine Genehmigungsauskunft. Verbindlich sind Bescheid
// und zuständige Behörde. Die Zuordnungen sind branchenüblich und von Setreo zu bestätigen.

const zahl = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : null)
const runde2 = (n) => Math.round(n * 100) / 100

export const FAHRBARKEIT = ["frei", "mit-auflagen", "einzelfallpruefung", "nicht-fahrbar"]
const RANG = { frei: 0, "mit-auflagen": 1, einzelfallpruefung: 2, "nicht-fahrbar": 3 }
const haerter = (a, b) => (RANG[a] >= RANG[b] ? a : b)

/**
 * Auflagen-Lage eines Hindernisses für DIESEN Transport.
 * @returns {{fahrbarkeit: string, auflagen: string[], begruendung: string, vorlauf: boolean}}
 */
export function bewerteAuflagen({ kategorie, attrs = {}, transport = {} }) {
  let lage = "frei"
  const auflagen = []
  const gruende = []

  const hoehe = zahl(transport.hoehe)
  const breite = zahl(transport.breite)
  const gewicht = zahl(transport.gesamtgewicht)

  // ── Höhe: das einzige, gegen das keine Auflage hilft, wenn es baulich nicht passt.
  const maxH = zahl(attrs.maxHoeheM)
  if (maxH != null && hoehe != null) {
    const spielraum = runde2(maxH - hoehe)
    if (spielraum < 0) {
      lage = haerter(lage, "nicht-fahrbar")
      gruende.push(`Durchfahrtshöhe ${maxH} m unter Transporthöhe ${hoehe} m`)
    } else if (spielraum < 0.1) {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Höhenkontrolle vor Ort", "Schrittgeschwindigkeit", "ggf. Führung über Mittelstreifen oder Gegenfahrbahn")
      gruende.push(`nur ${spielraum} m Spielraum in der Höhe`)
    } else if (spielraum < 0.5) {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Höhenkontrolle vor Ort")
      gruende.push(`${spielraum} m Spielraum in der Höhe`)
    }
  }

  // ── Tragfähigkeit: überschritten heißt NICHT automatisch unmöglich. Brücken werden
  //    regelmäßig nach Einzelfallprüfung mit Auflagen freigegeben — aber das Verfahren
  //    braucht Vorlauf, und genau das muss die Planung wissen.
  const maxG = zahl(attrs.maxGewichtT)
  if (maxG != null && gewicht != null) {
    const reserve = runde2(maxG - gewicht)
    if (reserve < 0) {
      lage = haerter(lage, "einzelfallpruefung")
      auflagen.push("Bauwerksprüfung / statischer Nachweis", "Alleinbenutzung", "Schrittgeschwindigkeit", "Fahren in Brückenmitte")
      gruende.push(`zulässige Last ${maxG} t unter Gesamtgewicht ${gewicht} t`)
    } else if (reserve < 10) {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Alleinbenutzung", "Schrittgeschwindigkeit", "Fahren in Brückenmitte")
      gruende.push(`nur ${reserve} t Reserve auf dem Bauwerk`)
    }
  }

  // ── Breite: die klassische Auflagen-Situation (Begleitung, Gegenfahrbahn, Sperrung).
  const maxB = zahl(attrs.maxBreiteM)
  if (maxB != null && breite != null) {
    const marge = runde2(maxB - breite)
    if (marge < 0) {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Begleitfahrzeug BF3", "Mitbenutzung der Gegenfahrbahn", "ggf. kurzzeitige Sperrung durch die Polizei")
      gruende.push(`Restbreite ${maxB} m unter Transportbreite ${breite} m`)
    } else if (marge < 0.5) {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Begleitfahrzeug BF3")
      gruende.push(`nur ${marge} m Seitenabstand`)
    }
  }

  // ── Behördliche Kennzeichen.
  if (attrs.gesperrtKomplett === true) {
    lage = haerter(lage, "nicht-fahrbar")
    gruende.push("für genehmigungspflichtigen Schwerverkehr gesperrt")
  } else if (attrs.grundsaetzlicheGstSperre === true) {
    lage = haerter(lage, "einzelfallpruefung")
    auflagen.push("Tragfähigkeitsnachweis für Großraum-/Schwertransport")
    gruende.push("Bauwerk ist für Großraum-/Schwertransporte auflagenpflichtig")
  }

  // ── Gemeldete Ereignisse: eine Vollsperrung ist zu, alles andere ist Verkehrsführung.
  if (kategorie === "sperrung") {
    if (attrs.vollsperrung === true) {
      lage = haerter(lage, "nicht-fahrbar")
      gruende.push("Vollsperrung")
    } else {
      lage = haerter(lage, "mit-auflagen")
      auflagen.push("Verkehrsführung der Baustelle beachten")
      gruende.push("Sperrung mit Verkehrsführung")
    }
  } else if (kategorie === "baustelle" && lage === "frei") {
    lage = "mit-auflagen"
    auflagen.push("Verkehrsführung der Baustelle beachten, Restbreite vor Ort prüfen")
    gruende.push("Baustelle im Streckenverlauf")
  }

  return {
    fahrbarkeit: lage,
    auflagen: [...new Set(auflagen)],
    begruendung: gruende.join("; ") || "keine einschränkenden Werte hinterlegt",
    // Braucht die Stelle ein VERFAHREN, bevor gefahren werden darf? Dann entscheidet
    // sie über den Termin, nicht über die Auflage.
    vorlauf: lage === "einzelfallpruefung",
  }
}
