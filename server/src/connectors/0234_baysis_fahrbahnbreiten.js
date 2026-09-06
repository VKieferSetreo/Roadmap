// Connector Quelle 0234: BAYSIS Fahrbahnbreiten (Bayern) — Engstellen im klassifizierten Netz.
//
// WARUM DIESE QUELLE: Bayern ist die groesste Massluecke im Bestand — 12.341 Eintraege, davon 304
// mit einer Massangabe (2 %, gemessen 06.09.2026). Grund ist die QUELLE, nicht der Connector:
// 0123 zieht die BAYSIS-Bauwerke vollstaendig, aber von 12.295 Bruecken/Tunneln tragen nur 49 eine
// Hoehenbeschraenkung und 25 eine Gewichtsbeschraenkung (am 06.09.2026 ueber Zaehlabfragen gemessen).
// Ein Verkehrszeichenkataster gibt es in Bayern nicht: die sieben BAYSIS-WFS fuehren Baulast,
// Bahnigkeit, Ortsdurchfahrt, Fahrbahnbreiten, Fahrstreifen, Netzknoten, Verkehrsmengen,
// Bedarfsumleitungen und Bauwerke — kein Zeichen 253/262/263/264/265/266. open.bydata.de kennt zu
// „Verkehrszeichen" genau einen Datensatz (Umweltzone Muenchen), zu „Durchfahrtshoehe",
// „Tonnage", „Schwertransport", „Gewichtsbeschraenkung" und „Engstelle" keinen einzigen. Der
// GDI-DE-Katalog listet unter „Verkehrszeichen" 101 Records — keinen aus Bayern. Muenchen
// veroeffentlicht 369 Datensaetze und im GeoServer-Workspace mor_wfs 68 Layer, darunter kein
// Schilder- oder Restriktionskataster; Wuerzburgs Portal fuehrt 184 Datensaetze ohne Verkehrsbezug.
// Diese Schicht ist damit die EINZIGE maschinell abrufbare bayerische Quelle mit einem echten,
// amtlich gemessenen GST-Mass.
//
// WAS DIE DATEN SIND: der ASB-Querschnitt der Strasse, Element fuer Element (Fahrbahn, Bordstein,
// Rinne, Radfahrstreifen, Mittelstreifen, Verkehrsinsel …), je Station mit linkem und rechtem
// X-Wert zur Strassenachse. Breite = Rechter X-Wert minus Linker X-Wert; das stimmt bei ALLEN
// 124.402 durchgehenden Fahrbahn-Elementen auf den Zentimeter (gemessen 06.09.2026) und belegt,
// dass die Werte Meter sind — der Feld-Alias „Von-Breite (cm)" ist ein Altlast-Label der Quelle.
//
// WAS WIR DARAUS ABLEITEN: die Breite des breitesten durchgehend befahrbaren Fahrbahnstreifens je
// Station. Wo eine Verkehrsinsel oder ein Mittelstreifen die Fahrbahn teilt, liegen dort ZWEI
// Fahrbahn-Elemente nebeneinander (z.B. St 2510 bei Station 1,721: 3,50 m | Querungshilfe 1,90 m |
// 3,50 m, davor und danach 9,00 m am Stueck). Der breitere der beiden Streifen ist das, was ein
// Transport ohne Ueberfahren der Insel nutzen kann. Das ist keine Interpretation, sondern die
// Geometrie der Quelle.
//
// WARUM GRUPPIERT WIRD (und nicht Element fuer Element importiert): 13-16 % der schmalen Elemente
// stehen an Stationen, deren andere Haelfte breit ist (986 von 7.606 geteilten Stationen weichen um
// mehr als 1 m ab). Wer jedes schmale Element einzeln meldet, erfindet dort eine Engstelle, die es
// nicht gibt. Der Server-Filter zieht nur schmale Elemente; ob die Gegenseite ebenfalls schmal ist,
// verraet die LAGE zur Achse: ein Element, das die Achse ueberspannt (links < 0 < rechts), IST die
// ganze Fahrbahn; liegt es nur auf einer Seite, muss die andere Seite im Abzug auftauchen, sonst
// ist sie breiter als die Grenze und die Station passierbar. Diese Regel wurde gegen den
// VOLLBESTAND geprueft (124.402 Elemente, 116.784 Stationen): sie trifft dieselbe Menge wie eine
// echte Max-Bildung ueber alle Elemente, mit 4 Abweichungen von 2.082 bei 4,0 m.
//
// GRENZE 4,50 m: ein Grossraumtransport ist per Definition breiter als 3,00 m. Unter 4,50 m
// befahrbarer Breite bleibt ihm weniger als 0,75 m Gesamtspielraum — das ist der Bereich, in dem
// die Engine Begleitung, Mitbenutzung der Gegenfahrbahn oder Sperrung verlangt. Breitere Stellen
// waeren fuer jeden realistischen Transport folgenlos und nur Bestandsrauschen.
//
// LIZENZ: Creative Commons Namensnennung 4.0, Fees „none" — beides steht im GetCapabilities des
// Dienstes selbst (ows:AccessConstraints). Kommerzielle Nutzung erlaubt, Namensnennung
// „Datenquelle: Bayerische Strassenbauverwaltung - BAYSIS (https://www.baysis.bayern.de)".
//
// TECHNIK: ArcGIS-WFS 2.0, GeoJSON, srsName EPSG:4326 (keine Reprojektion noetig). Der Filter
// laeuft SERVERSEITIG (7.212 statt 193.936 Features). Feldnamen im WFS sind die Alias-Namen mit
// ersetzten Sonderzeichen — „Von-Breite__cm__", „Ist_Ast", „Strassenbezeichnung" mit ss als ß.

import { makeNormalized, fetchAllFeatures, ersterPunkt, stabilHash } from "./_helpers.js"

const QUELLE = "0234"
const QUELLE_NAME = "BAYSIS Fahrbahnbreiten (Bayerische Straßenbauverwaltung)"
const QUELLE_URL = "https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/"
const WFS = "https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Strassenbestand/MapServer/WFSServer"
const TYPENAME = "BAYSIS_Strassenbestand:fahrbahnbreiten"

/** Ab hier ist eine Fahrbahn fuer einen Grossraumtransport (> 3,00 m breit) eine Engstelle. */
const GRENZE_M = 4.5
/** Untergrenze der Plausibilitaet. 12 Elemente tragen 1,00-1,50 m auf B-, St- und K-Strassen, alle
 *  mit dem Achsen-Default X[-0,5 | 0,5] — das ist eine Erfassungsluecke, keine 1-m-Bundesstrasse.
 *  Ohne diese Schranke wuerde jede davon fuer JEDEN Transport ein Falsch-Kritisch erzeugen. */
const MIN_PLAUSIBEL_M = 2.5

const FES = "http://www.opengis.net/fes/2.0"
const eq = (feld, wert) =>
  `<fes:PropertyIsEqualTo><fes:ValueReference>${feld}</fes:ValueReference><fes:Literal>${wert}</fes:Literal></fes:PropertyIsEqualTo>`
const lt = (feld, wert) =>
  `<fes:PropertyIsLessThan><fes:ValueReference>${feld}</fes:ValueReference><fes:Literal>${wert}</fes:Literal></fes:PropertyIsLessThan>`

// Nur Art „Fahrbahn" (die 40 anderen Querschnittsarten sind Borde, Rinnen, Rad-, Park- und
// Mittelstreifen — kein Fahrraum) und nur die durchgehende Strecke (Ist_Ast = Nein): ein 3,50 m
// breiter Ast ist eine einspurige Rampe am Knotenpunkt und keine Engstelle der Strecke.
// Von- ODER Bis-Breite, weil sich der Querschnitt ueber das Element verjuengen darf — 392 Elemente
// beginnen breit und enden unter der Grenze; nur auf die Von-Breite zu filtern verliert sie.
const FILTER =
  `<fes:Filter xmlns:fes="${FES}"><fes:And>` +
  eq("Art", "Fahrbahn") +
  eq("Ist_Ast", "Nein") +
  `<fes:Or>${lt("Von-Breite__cm__", GRENZE_M)}${lt("Bis-Breite__cm__", GRENZE_M)}</fes:Or>` +
  `</fes:And></fes:Filter>`

const BASE =
  `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TYPENAME)}` +
  `&outputFormat=GEOJSON&srsName=EPSG:4326&FILTER=${encodeURIComponent(FILTER)}`

const zahl = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null)

/** Massgebliche Breite eines Querschnitt-Elements: das schmalste Ende. Ein Element, das von 6,00 m
 *  auf 4,20 m zulaeuft, ist an seiner engsten Stelle 4,20 m breit — das ist der Wert, an dem ein
 *  Transport haengenbleibt. 0 und null heissen „nicht erfasst" und zaehlen nicht als Engstelle. */
function elementBreite(p) {
  const von = zahl(p["Von-Breite__cm__"])
  const bis = zahl(p["Bis-Breite__cm__"])
  if (von != null && bis != null) return Math.min(von, bis)
  return von ?? bis
}

/** Die X-Werte an dem Ende, das die massgebliche Breite traegt — dort entscheidet sich die Lage. */
function xWerte(p) {
  const von = zahl(p["Von-Breite__cm__"])
  const bis = zahl(p["Bis-Breite__cm__"])
  if (von != null && bis != null && bis < von) {
    return [p["Linker_X-Wert_an_der_Bis-Station"], p["Rechter_X-Wert_an_der_Bis-Station"]]
  }
  return [p["Linker_X-Wert_an_der_Von-Station"], p["Rechter_X-Wert_an_der_Von-Station"]]
}

/** Liegt das Element ueber der Strassenachse? Dann ist es die ganze, ungeteilte Fahrbahn — eine
 *  zweite Haelfte kann es nicht geben. Liegt es nur links oder nur rechts, ist die Fahrbahn geteilt. */
function ueberspanntAchse(p) {
  const [l, r] = xWerte(p)
  return Number.isFinite(l) && Number.isFinite(r) && l < 0 && r > 0
}

/** Deckt der Abzug die ganze Fahrbahn der Station ab? Entweder ueberspannt ein Element die Achse
 *  (= ungeteilte Fahrbahn, es gibt keine zweite Haelfte), oder es liegt links UND rechts der Achse
 *  je ein schmales Element (= beide Haelften der geteilten Fahrbahn sind schmal). Fehlt eine Seite,
 *  ist sie breiter als die Grenze und der Transport kommt dort vorbei. */
function fahrbahnVollstaendig(elemente) {
  let links = false
  let rechts = false
  for (const p of elemente) {
    if (ueberspanntAchse(p)) return true
    const [l, r] = xWerte(p)
    if (!Number.isFinite(l) || !Number.isFinite(r)) continue
    if (r <= 0) links = true
    if (l >= 0) rechts = true
  }
  return links && rechts
}

/** „B 471" → „B471", „B 16 A" → „B16A", „St 2510" → „St2510", „K WÜ 17" → „WÜ17" (bayerische
 *  Kreisstrassen heissen im Bestand nach dem Kreiskuerzel, wie 0147 sie aus BayernInfo liefert —
 *  so greift die Dubletten-Erkennung ueber beide Quellen). Der Buchstaben-Suffix MUSS mit: „B 16 A"
 *  ist eine andere Strasse als die B 16, und ohne ihn haengt die Engstelle am falschen Netz.
 *  Gemeindestrassen (Klasse G, im Abzug 15 Stueck) tragen keine Referenz im klassifizierten Netz. */
function netzRef(bez, klasse) {
  const s = String(bez ?? "").trim()
  if (!s) return null
  if (klasse === "K") {
    const k = s.match(/^K\s+([A-ZÄÖÜ]{1,3})\s*(\d{1,4})\s*([a-zA-Z])?$/i)
    return k ? `${k[1].toUpperCase()}${k[2]}${k[3] ? k[3].toUpperCase() : ""}` : null
  }
  const m = s.match(/^(A|B|St|L)\s*(\d{1,4})\s*([a-zA-Z])?$/i)
  if (!m) return null
  const praefix = m[1].length === 2 ? "St" : m[1].toUpperCase()
  return `${praefix}${m[2]}${m[3] ? m[3].toUpperCase() : ""}`
}

const deZahl = (n) => n.toFixed(2).replace(".", ",")

export const baysisFahrbahnbreitenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  // Der Strassenbestand ist laut Dienst-Abstract tagesaktuell, aendert sich als Bauwerksbestand aber
  // nur mit Umbauten. Woechentlich reicht und haelt die 7.212 Features aus dem taeglichen Fenster.
  schedule: "0 4 * * 2",
  // Server-Filter + Paging bis numberMatched ziehen den VOLLSTAENDIGEN Bestand der Engstellen
  // → Reconcile darf entfallene Stellen (Ausbau, Rueckbau der Insel) deaktivieren.
  vollbestand: true,

  async fetch({ timeoutMs = 90000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 2000, maxPages: 100, timeoutMs, log })
    // Ein leerer Abzug ist hier kein gueltiges Ergebnis: der Strassenbestand ist statisch. Kaeme 0
    // durch, wuerde der Vollbestand-Reconcile jede bayerische Engstelle deaktivieren („Strecke frei").
    if (!feats || feats.length === 0) {
      throw new Error(`${QUELLE}: WFS lieferte 0 Fahrbahn-Elemente — Bestand unveraendert gelassen`)
    }

    // Nach Station gruppieren: Strasse + Netzknotenpaar + Ast + Von/Bis-Station ist der fachliche
    // Schluessel der Quelle (ASB-Stationierung) und ueber Datenstaende stabil — anders als OBJECTID.
    const stationen = new Map()
    for (const f of feats) {
      const p = f?.properties ?? {}
      if (elementBreite(p) == null) continue
      const von = Number(p["Von-Station_"])
      const bis = Number(p["Bis-Station_"])
      if (!Number.isFinite(von) || !Number.isFinite(bis)) continue
      const key = [p["Straßenbezeichnung"], p.VNK, p.NNK, p.Ast ?? "", von.toFixed(3), bis.toFixed(3)].join("|")
      const eintrag = stationen.get(key) ?? { key, von, bis, features: [] }
      eintrag.features.push(f)
      stationen.set(key, eintrag)
    }

    const obstacles = []
    let unvollstaendig = 0
    let ueberGrenze = 0
    let unplausibel = 0
    let ohneKoordinate = 0

    for (const st of stationen.values()) {
      const props = st.features.map((f) => f.properties)
      if (!fahrbahnVollstaendig(props)) {
        unvollstaendig++
        continue
      }
      // Der breiteste Streifen der Station bestimmt, was durchpasst.
      const breite = Math.max(...props.map((p) => elementBreite(p)))
      // Faengt Elemente ab, deren Gegenende nicht erfasst ist (Bis-Breite 0) und die deshalb ueber
      // den Or-Filter hereingekommen sind, obwohl die Fahrbahn breit ist.
      if (breite >= GRENZE_M) {
        ueberGrenze++
        continue
      }
      if (breite < MIN_PLAUSIBEL_M) {
        unplausibel++
        continue
      }
      const p = props[0]
      const [lng, lat] = ersterPunkt(st.features[0].geometry)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        ohneKoordinate++
        continue
      }

      const ref = netzRef(p["Straßenbezeichnung"], p["Straßenklasse"])
      // Ohne Netz-Referenz (Gemeindestrassen) NICHT die Roh-Bezeichnung in den Titel: „G A 210" ist
      // eine Gemeindestrasse im Landkreis Aschaffenburg, die Freitext-Extraktion von makeNormalized
      // liest daraus aber „A210" und haengt die Engstelle an eine Autobahn (T-618-Muster).
      const strasse = ref ? String(p["Straßenbezeichnung"]).trim() : "Gemeindestraße"
      // Geteilt heisst: KEIN Element ueberspannt die Achse — die Fahrbahn laeuft links und rechts
      // an einer Insel vorbei. Das ist die Lage-Aussage der Quelle, nicht die Anzahl der Elemente.
      const geteilt = !props.some(ueberspanntAchse)
      const laengeM = Math.round((st.bis - st.von) * 1000)
      const wort = geteilt ? "Fahrbahnteilung" : "Fahrbahnbreite"
      // Kein „Länge …"-Wortlaut im Text: makeNormalized wuerde daraus sperrlaengeM ziehen und den
      // Fund als KI-aufbereitet markieren, obwohl jeder Wert strukturiert aus der Quelle kommt.
      const ausdehnung = laengeM > 0 ? ` auf ${laengeM} m` : ""
      const beschreibung = geteilt
        ? `Die Fahrbahn ist hier geteilt (Verkehrsinsel oder Mittelstreifen). Der breiteste durchgehend ` +
          `befahrbare Streifen misst ${deZahl(breite)} m${ausdehnung}. Netzknoten ${p.VNK ?? "?"}–${p.NNK ?? "?"}, ` +
          `Station ${st.von.toFixed(3).replace(".", ",")}–${st.bis.toFixed(3).replace(".", ",")} km.`
        : `Durchgehende Fahrbahn von ${deZahl(breite)} m${ausdehnung}. Netzknoten ${p.VNK ?? "?"}–${p.NNK ?? "?"}, ` +
          `Station ${st.von.toFixed(3).replace(".", ",")}–${st.bis.toFixed(3).replace(".", ",")} km.`

      obstacles.push(
        makeNormalized({
          // Fachschluessel der Stationierung + Geometrie-Hash: eindeutig je Station, stabil ueber
          // Laeufe (OBJECTID waere es nicht — sie wird bei Neuaufbau des Layers neu vergeben).
          externeId: `${st.key.replaceAll("|", "-")}#${stabilHash(lat, lng)}`,
          kategorie: "engstelle",
          name: `${wort} ${deZahl(breite)} m — ${strasse}`,
          beschreibung,
          lat,
          lng,
          strassenRef: ref,
          attrs: {
            // maxBreiteM = dauerhafte bauliche Breite; genau so wertet ruleEngstelle sie („Fahrbahn
            // verengt sich", Marge gegen die Transportbreite). Bewusst NICHT restbreiteM: das Feld
            // steht in der Engine fuer die Restbreite einer BAUSTELLE und loest eine Abstimmung mit
            // dem Baustellenbetreiber aus — hier gibt es keine Baustelle, sondern gebaute Strasse.
            maxBreiteM: breite,
          },
          // Kein gueltigVon/gueltigBis: gebaute Fahrbahnbreite gilt dauerhaft.
          roh: {
            Strassenbezeichnung: p["Straßenbezeichnung"],
            Strassenklasse: p["Straßenklasse"],
            VNK: p.VNK,
            NNK: p.NNK,
            Ast: p.Ast,
            VonStation: p["Von-Station_"],
            BisStation: p["Bis-Station_"],
            Fahrbahnelemente: props.length,
            BreitenM: props.map((x) => elementBreite(x)),
            Layerdatum: p.Layerdatum_,
          },
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }),
      )
    }

    log(
      `${QUELLE}: ${feats.length} Fahrbahn-Elemente · ${stationen.size} Stationen · ${obstacles.length} Engstellen · ` +
        `verworfen: ${unvollstaendig} Gegenseite breiter, ${ueberGrenze} ueber ${GRENZE_M} m, ` +
        `${unplausibel} unter ${MIN_PLAUSIBEL_M} m, ${ohneKoordinate} ohne Koordinate`,
    )
    return { obstacles }
  },
}
