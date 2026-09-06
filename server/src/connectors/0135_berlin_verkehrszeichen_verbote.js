// Connector Quelle 0135: Berlin — Verkehrszeichen-Verbote (Straßenbefahrung, GDI-BE).
// Kategorische Durchfahrtsverbote aus dem Berliner Verkehrszeichen-Kataster: Zeichen 250
// (Verbot für Fahrzeuge aller Art), 251 (Verbot für Kraftwagen) und 253 (Lkw-Verbot über 3,5 t
// zulässige Gesamtmasse). WFS 2.0, GeoJSON in EPSG:4326 (coords bereits [lng,lat], kein Reproj).
// Lizenz: dl-de/zero-2.0 (WFS-Fees-Feld des Dienstes) — kommerzielle Nutzung erlaubt, keine
// Namensnennung nötig. Herausgeber: Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen.
// Datensatzseite: https://daten.berlin.de/datensaetze/straßenbefahrung-2014-verkehrszeichen-wfs-1
//
// WARUM NUR DIE VERBOTS-ZEICHEN, NICHT DIE MASS-ZEICHEN:
// Der Berliner Kataster führt die Schilder im Feld `vkz_zeiche` als Komma-Liste reiner
// StVO-Nummern OHNE Wert ("262", "265", "264") — anders als Hamburg (0134: "265-3,8") oder
// SEVAS NRW (0157: eigenes Wert-Feld). Gemessen am 06.09.2026 über den kompletten Layer:
// 763× Zeichen 262, 721× 265, 94× 264, 11× 266, 8× 263 — davon 0 (null) mit Wert-Suffix.
// Aus einem wertlosen "262" lässt sich kein maxGewichtT ableiten, ohne eine Zahl zu erfinden;
// diese Zeichen bleiben deshalb bewusst draußen. Die Berliner Durchfahrtshöhen liefert
// ohnehin Quelle 0133 gemessen (nicht beschildert).
// Die drei KATEGORISCHEN Verbote brauchen dagegen keinen Wert — ihr Grenzwert steht in der
// StVO selbst. Mapping identisch zu 0157 (T-632, dort für NRW entschieden), damit dieselbe
// Restriktion bundesweit dieselben attrs trägt.
//
// WAF-HINWEIS: gdi.berlin.de steht hinter einer Application-Firewall, die mehrgliedrige
// CQL_FILTER-Ausdrücke mit "Request Rejected" (HTTP 200, text/html) verwirft. Der OGC-konforme
// FILTER-Parameter (fes:Or aus PropertyIsLike, wie in 0134) kommt sauber durch — verifiziert
// am 06.09.2026. getJson wirft bei text/html ohnehin DienstAusFehler, ein WAF-Block kann also
// nie als leerer Feed durchgehen und den Vollbestand-Reconcile auslösen.

import { fetchAllFeatures, makeNormalized } from "./_helpers.js"

const QUELLE = "0135"
const QUELLE_NAME = "Berlin — Verkehrszeichen-Verbote (Straßenbefahrung, GDI-BE)"
const QUELLE_URL = "https://gdi.berlin.de/services/wfs/strassenbefahrung"

const CODES = ["250", "251", "253"]
const FILTER =
  `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:Or>` +
  CODES.map(
    (c) =>
      `<fes:PropertyIsLike wildCard="*" singleChar="." escapeChar="!">` +
      `<fes:ValueReference>vkz_zeiche</fes:ValueReference><fes:Literal>*${c}*</fes:Literal>` +
      `</fes:PropertyIsLike>`,
  ).join("") +
  `</fes:Or></fes:Filter>`
const BASE =
  `${QUELLE_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
  "&TYPENAMES=strassenbefahrung:aa_verkehrszeichen&OUTPUTFORMAT=application/json" +
  "&SRSNAME=urn:ogc:def:crs:EPSG::4326" +
  `&FILTER=${encodeURIComponent(FILTER)}`

// Der serverseitige LIKE-Filter ist absichtlich unscharf (*253* trifft auch "1253" oder ein
// Zusatzzeichen mit der Ziffernfolge). Die verbindliche Zuordnung passiert hier: `vkz_zeiche`
// wird an den Kommas zerlegt und jedes Token muss EXAKT die Zeichennummer sein. Das führende
// "e" ist die Berliner Schreibweise für ein Schild der Gegenrichtung und gehört dazu.
const ZEICHEN_RE = /^e?(\d{3})$/

// vollsperrung/verkehrsverbotLkwT = die im Haus etablierten attrs (0157, T-632). 250/251 sind
// echte Durchfahrtssperren (Engine: kritisch), 253 ist ein rechtliches Verbot ohne physische
// Grenze (Engine: Warnung, genehmigungsabhängig) — bewusst NICHT als maxGewichtT, denn 253
// meint die zulässige Gesamtmasse, 262 das tatsächliche Gewicht.
const VERBOT = {
  "250": {
    kategorie: "sperrung",
    label: "Durchfahrt verboten für Fahrzeuge aller Art (Zeichen 250)",
    attrs: { vollsperrung: true },
  },
  "251": {
    kategorie: "sperrung",
    label: "Verbot für Kraftwagen (Zeichen 251)",
    attrs: { vollsperrung: true },
  },
  // TITEL OHNE TONNAGE-ZAHL, mit Absicht: makeNormalized zieht fehlende Grenzwerte aus
  // Name + Beschreibung nach. Die naheliegende Formulierung "über 3,5 t zulässige Gesamtmasse"
  // trifft die Kontext-Regel von tonnageAusText ("<Zahl> t … zul") und hat im Test prompt ein
  // maxGewichtT: 3.5 erzeugt — also eine PHYSISCHE Traglastgrenze von dreieinhalb Tonnen auf
  // jedem dieser Punkte. Jeder Schwertransport wäre daran kritisch gescheitert, obwohl Zeichen
  // 253 nur ein rechtliches Verbot ist. Die Grenze steht in verkehrsverbotLkwT, die Anzeige
  // holt sie von dort; im Titel hat sie nichts zu suchen.
  "253": {
    kategorie: "gewicht",
    label: "Lkw-Durchfahrtsverbot (Zeichen 253)",
    attrs: { verkehrsverbotLkwT: 3.5 },
  },
}
// Reihenfolge der Auswertung: steht auf einem Mast mehr als ein Verbot, gilt das schärfste.
// Im Bestand vom 06.09.2026 kommt das nicht vor (966 + 1 + 487 = 1454 = Gesamttreffer, also
// genau ein Verbot je Schild), der Fall ist rein defensiv abgesichert.
const RANG = ["250", "251", "253"]

/** Zeichen-Nummern eines Mastes als Set — nur exakte Treffer, kein Substring-Zufall. */
function zeichenAus(vkz) {
  const set = new Set()
  for (const teil of String(vkz ?? "").split(",")) {
    const m = ZEICHEN_RE.exec(teil.trim())
    if (m) set.add(m[1])
  }
  return set
}

// Zusatzzeichen der 1020-/1026-Familie sind Ausnahmen ("Anlieger frei", "Lieferverkehr frei"),
// die 1040-/1042-Familie ist eine Zeitbeschränkung. Beides ändert die Bewertung NICHT — ein
// durchfahrender Großraum- oder Schwertransport ist kein Anlieger —, gehört dem Disponenten
// aber gesagt, damit er den Sonderfall (Ziel liegt an der Straße) selbst erkennt. Die konkrete
// Bedeutung der Unternummer wird nicht geraten, der Rohtext steht vollständig in der Beschreibung.
function zusatzHinweis(vkz) {
  const teile = String(vkz ?? "").split(",").map((s) => s.trim().replace(/^e/, ""))
  const hinweise = []
  if (teile.some((t) => /^10(20|26)-/.test(t))) {
    hinweise.push("Zusatzzeichen mit Ausnahmen (z. B. Anlieger- oder Lieferverkehr frei) — für den durchfahrenden Transport in der Regel nicht einschlägig.")
  }
  if (teile.some((t) => /^104[02]-/.test(t))) {
    hinweise.push("Zusatzzeichen mit Zeitangabe — das Verbot gilt nur im dort genannten Zeitraum.")
  }
  return hinweise
}

export const berlinVerkehrszeichenVerboteConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 6 * * 3", // statisches Kataster (Straßenbefahrung 2014/2015) → wöchentlich reicht
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 20, timeoutMs, log })
    const obstacles = []
    const gezaehlt = { 250: 0, 251: 0, 253: 0 }
    let ohneVerbot = 0
    let ohneKoordinate = 0

    for (const f of feats) {
      const p = f?.properties ?? {}
      const gefunden = zeichenAus(p.vkz_zeiche)
      const code = RANG.find((c) => gefunden.has(c))
      if (!code) {
        ohneVerbot++ // LIKE-Zufallstreffer (Ziffernfolge in einer anderen Nummer)
        continue
      }
      // Nicht Number(c[0]) direkt: Number(null) ist 0, ein Schild ohne Geometrie wäre so als
      // Punkt auf der Nullinsel durchgerutscht (Number.isFinite(0) ist true). makeNormalized
      // hätte lat/lng anschließend über inDeBbox verworfen — der Eintrag wäre aber trotzdem
      // erzeugt worden und erst im Import als ungültig gezählt. Hier sauber aussortieren.
      const c = f?.geometry?.coordinates
      const [rohLng, rohLat] = Array.isArray(c) ? c : [null, null]
      const lng = rohLng == null ? null : Number(rohLng)
      const lat = rohLat == null ? null : Number(rohLat)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        ohneKoordinate++
        continue
      }

      const { kategorie, label, attrs } = VERBOT[code]
      // "-" ist im Kataster der Platzhalter für "kein Straßenname erfasst".
      const strasse = String(p.strasse ?? "").trim()
      const strasseKlar = strasse && strasse !== "-" ? strasse : null
      const bezirk = String(p.bezirk ?? "").trim() || null

      // KEIN Datum in den Freitext: `gilt_von` ist das Datum der Katastererfassung, ein reines
      // Stand-Datum. extractStammdaten hat es im Test zusammen mit dem Wort "gilt" aus dem
      // Zusatzzeichen-Hinweis als Gültigkeitsbeginn gelesen und daraus gueltigVon UND realerStart
      // gesetzt — letzterer geht in die fachId. Ein Verkehrszeichen hat keinen Gültigkeitszeitraum,
      // es steht oder es steht nicht. Das Erfassungsdatum bleibt in `roh` für die Anreicherung.
      const beschreibung = [
        `Beschilderung laut Verkehrszeichen-Kataster: ${String(p.vkz_zeiche ?? "").trim() || "ohne Angabe"}.`,
        ...zusatzHinweis(p.vkz_zeiche),
        [strasseKlar, bezirk && `Bezirk ${bezirk}`].filter(Boolean).join(" · ") || null,
        "Erhebung: Straßenbefahrung Berlin, Stand des Katasters kann von der Beschilderung vor Ort abweichen.",
      ].filter(Boolean).join(" ")

      obstacles.push(
        makeNormalized({
          externeId: `be-vz#${p.sdatenid ?? f.id}`,
          kategorie,
          name: label + (strasseKlar ? ` — ${strasseKlar}` : ""),
          beschreibung,
          lat,
          lng,
          attrs,
          // T-618: reine Stadtstaat-Quelle — eine klassifizierte Ref darf nicht aus dem
          // Beschreibungstext gezogen werden (dort stünde sie nur als Nachbar-/Zusatzangabe).
          refAusBeschreibung: false,
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
          roh: p,
        }),
      )
      gezaehlt[code]++
    }

    log(
      `${QUELLE}: ${feats.length} Schilder geladen · ${obstacles.length} Verbote ` +
        `(250: ${gezaehlt[250]} · 251: ${gezaehlt[251]} · 253: ${gezaehlt[253]}) · ` +
        `${ohneVerbot} ohne exaktes Verbotszeichen · ${ohneKoordinate} ohne Koordinate`,
    )
    return { obstacles }
  },
}
