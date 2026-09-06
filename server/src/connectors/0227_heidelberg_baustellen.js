// Connector Quelle 0227: Heidelberg — Baustellen (Baustellenkarte der Stadt Heidelberg).
// Ein Abruf, lat/lng nativ WGS84, dazu ein Polygon je Baustelle. Lizenz CC-BY 4.0, „Stadt Heidelberg".
//
// T-691 (06.09.2026): Die Quelle ist umgezogen. Der bis dahin genutzte Open-Data-Feed
// https://www.heidelberg.de/site/Heidelberg2021/BSTXC/1254509/data.json antwortet seit der
// Umstellung mit HTTP 404 (CMS-Fehlerseite, gemessen 06.09.2026). Die Stadt hat die alte
// Baustellenliste zum 01.08.2026 durch die digitale Baustellenkarte baustellen.heidelberg.de
// ersetzt (Pressemitteilung 24.07.2026). Die Metadatenportale (CKAN Heidelberg, MobiData BW,
// GovData) zeigen weiterhin die tote Feed-URL — sie sind nicht nachgepflegt und taugen nicht
// als Bezugsquelle. Einen dokumentierten JSON-Endpunkt gibt es fuer die neue Karte nicht;
// die Seite rendert serverseitig und liefert ihren Datenbestand im Seitenrumpf mit.
//
// Gewinn gegenueber dem alten Feed: strukturierte ISO-Zeitraeume statt deutschem Datums-Freitext
// (der frueher hier lokal geparste "Beginn der Arbeit: 6. Juli 2026"-Fall entfaellt komplett),
// dazu Sperrungsgrad je Verkehrsart, Stadtteil und Flaechengeometrie.

import { makeNormalized, getText, dateOnly, stabilHash } from "./_helpers.js"

const QUELLE = "0227"
const QUELLE_NAME = "Heidelberg — Baustellen (Baustellenkarte Stadt Heidelberg)"
const QUELLE_URL = "https://baustellen.heidelberg.de/"
const BASE = "https://baustellen.heidelberg.de/"

/** Der Seiten-Datenbestand kommt in mehreren `self.__next_f.push([1,"<json-string>"])`-Aufrufen
 *  im Rumpf an und muss vor dem Auswerten wieder zusammengesetzt werden. Jeder Aufruf traegt ein
 *  JSON-String-Literal, das erst dekodiert werden muss (die Nutzdaten sind darin escaped). */
function seitenPayload(html) {
  const teile = []
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    // Ein einzelnes unlesbares Fragment darf den Abruf nicht kippen; fehlt am Ende der ganze
    // Bestand, schlaegt weiter unten der Struktur-Check zu und der Lauf endet als Fehler.
    try { teile.push(JSON.parse(m[1])) } catch { continue }
  }
  return teile.join("")
}

/** Das erste JSON-Array hinter `schluessel` herausschneiden. Klammern zaehlen und dabei
 *  String-Literale ueberspringen, damit eine eckige Klammer in einem Baustellentitel den
 *  Ausschnitt nicht vorzeitig beendet. */
function jsonArrayNach(text, schluessel) {
  const i = text.indexOf(schluessel)
  if (i < 0) return null
  const start = text.indexOf("[", i + schluessel.length)
  if (start < 0) return null
  let tiefe = 0, imString = false, escaped = false
  for (let j = start; j < text.length; j++) {
    const c = text[j]
    if (imString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') imString = false
      continue
    }
    if (c === '"') imString = true
    else if (c === "[") tiefe++
    else if (c === "]" && --tiefe === 0) return text.slice(start, j + 1)
  }
  return null
}

// Die Quelle trennt den Sperrungsgrad nach Verkehrsart. Fuer Schwertransport zaehlt AUSSCHLIESSLICH
// die Fahrbahn: 85 der 183 Baustellen sind Gehweg-Vollsperrungen (gemessen 06.09.2026) und tragen das
// Wort "Vollsperrung" im Beschreibungstext — die Freitext-Heuristik in makeNormalized macht daraus
// sonst ein Fahrbahn-Kritisch (T-611, Falsch-Kritisch). Ein explizites false gewinnt gegen den
// Freitext-Nachzug, ein undefined laesst ihn zu.
//
// closureList fuehrt auf, welche Verkehrsarten ueberhaupt betroffen sind, und deckt sich zu 183/183
// mit dem laneClosure-Feld (gemessen 06.09.2026). Fehlt "laneClosure" darin, ist die Fahrbahn nach
// Angabe der Stadt frei — dann false, egal was im Freitext ueber den Gehweg steht. Nur bei einem
// betroffenen, aber unbenannten Fahrbahn-Grad ("gem. Baustellenverkehrszeichenplan") bleibt die
// Heuristik zustaendig, weil die Quelle den Grad dort selbst offen laesst.
function vollsperrungAus(p) {
  const liste = Array.isArray(p.closureList) ? p.closureList : null
  if (liste && !liste.includes("laneClosure")) return false
  if (p.laneClosure === "Vollsperrung") return true
  if (p.laneClosure === "keine Sperrung" || p.laneClosure === "teilweise" || p.laneClosure === "halbseitig") return false
  return undefined
}

export const heidelbergBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const html = await getText(BASE, { timeoutMs })
    // vollbestand: true — ein fehlgeschlagener Abruf darf NICHT als leerer Bestand durchgehen,
    // sonst deaktiviert der Reconcile alle Heidelberger Baustellen ("Strecke frei"). Genau so ist
    // diese Quelle nach dem Wegfall des alten Feeds wochenlang still auf 0 gelaufen.
    if (html == null) throw new Error(`${QUELLE}: Abruf ${BASE} fehlgeschlagen — Bestand unveraendert gelassen`)

    const rohArray = jsonArrayNach(seitenPayload(html), '"items":')
    if (rohArray == null) {
      throw new Error(`${QUELLE}: Baustellen-Datenbestand in ${BASE} nicht gefunden — Seitenaufbau geaendert`)
    }
    let rows
    try {
      rows = JSON.parse(rohArray)
    } catch (err) {
      throw new Error(`${QUELLE}: Baustellen-Datenbestand unlesbar (${err?.name ?? "parse-fail"}) — Seitenaufbau geaendert`)
    }
    if (!Array.isArray(rows)) throw new Error(`${QUELLE}: Baustellen-Datenbestand ist kein Array — Seitenaufbau geaendert`)

    const obstacles = rows.map((p) => {
      const lat = Number(p.latitude), lng = Number(p.longitude)
      const von = dateOnly(p.start)
      return makeNormalized({
        // Das mitgelieferte id-Feld ist die laufende Position im Datenbestand (0..n-1) und wandert,
        // sobald eine Baustelle wegfaellt — als externeId wuerde es beim naechsten Lauf einen
        // fremden Datensatz ueberschreiben. Fachlicher Schluessel statt Position: Titel, Beginn und
        // Ort sind zusammen ueber den gesamten Bestand eindeutig (183/183, gemessen 06.09.2026).
        externeId: `hd#${stabilHash(p.title, von, lat, lng)}`,
        kategorie: "baustelle",
        name: p.title || "Baustelle",
        beschreibung: p.description || null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        geom: p.geometry ?? null, // GeoJSON-Polygon (WGS84) der Baustellenflaeche
        strassenRef: null,
        refAusBeschreibung: false, // T-618: reine Stadt-Quelle → Ref nur aus Name, nicht aus Umleitungstext ("…über A 5")
        attrs: { vollsperrung: vollsperrungAus(p) },
        gueltigVon: von,
        gueltigBis: dateOnly(p.end),
        realerStart: von,
        roh: p,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${rows.length} Baustellen`)
    return { obstacles }
  },
}
