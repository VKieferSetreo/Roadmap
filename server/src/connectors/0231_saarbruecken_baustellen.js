// Connector Quelle 0231: Landeshauptstadt Saarbruecken — Baustellen ("sb-schafft").
//
// WARUM DIESE QUELLE (T-Saarland-Luecke, 06.09.2026): Das Saarland stand bei 0 aktiven Eintraegen.
// Die einzige landesweit offene Quelle ist 0127 (baustellen.saarland des LfS); sie fuehrt
// ausschliesslich Bundes- und Landesstrassen und laesst das staedtische Netz komplett aus.
// Ein eigener Rechercheschritt hat KEINE weitere offene Massen-/Restriktionsquelle fuers Saarland
// ergeben, gemessen am 06.09.2026:
//   · geoportal.saarland.de ArcGIS "Verkehr_WFS" (GetCapabilities, HTTP 200): 20 Layer, davon
//     kein einziger mit Massen oder Restriktionen (Radrouten, Ladesaeulen, Parkplaetze,
//     Netzknoten, Strassennetz, Zaehlstellen). Der ArcGIS-REST-Katalog ist nicht freigegeben.
//   · GDI-DE-Katalog (CSW gdk.gdi-de.org): "Verkehrszeichen + Saarland" = 0 Treffer,
//     "Saarland + Durchfahrtsh…" = 0 Treffer, "Bauwerk + Saarland" = 10 Treffer, alle
//     topografisch/hydrologisch (ATKIS, ALKIS, Gewaesserbauwerke), keine Tragfaehigkeiten.
//   · Die LfS-Bauwerkskarte (Bruecken im klassifizierten Netz) gibt es nur als PDF, und
//     saarland.de liegt hinter einer JavaScript-Bot-Pruefung (HTTP 403 fuer jeden Abruf).
//   · Ein Landes-Open-Data-Portal ist zwar angekuendigt (Meldung 15.05.2026), aber unter keiner
//     der ueblichen Domains erreichbar (opendata/daten/open-data.saarland.de: DNS leer).
// Bleibt die Landeshauptstadt: ihre Baustellenkarte traegt Fahrbahn-Sperrgrade, Zeitraeume und
// Koordinaten und ist damit die einzige gefundene Quelle, die die Luecke wirklich fuellt.
//
// LIZENZ: saarbruecken.de weist KEINE Lizenz aus (Impressum ohne Urheberrechts-/Nutzungsabsatz,
// geprueft 06.09.2026), verbietet die kommerzielle Nutzung aber auch nicht ausdruecklich.
// Nach der Skala aus Migration 062 ist das lizenz_status='open' (unklar, kein Verbot), NICHT
// 'ready'. Eine schriftliche Freigabe der Stadt waere der Weg zu 'ready'.
//
// AUFBAU: zwei Stufen, weil die Stadt keinen maschinenlesbaren Feed anbietet.
//   1. Die Uebersichtsseite rendert jede Baustelle als Google-Maps-Marker mit Koordinate,
//      Titel, Baustellencode, Adresse und der ID ihrer Detailseite.
//   2. Sperrgrad ("Informationen zur Verkehrslage") und Zeitraum stehen NUR auf der Detailseite,
//      je Baustelle ein Abruf. Gemessen 06.09.2026: 45 Marker, 45 Detailseiten HTTP 200, davon
//      45 mit Arbeitsbeginn und Ende, 32 mit einem Verkehrslage-Text.
//
// FALSCH-KRITISCH-SCHUTZ: das Verkehrslage-Feld enthaelt teils kurze Katalogwerte
// ("Vollsperrung Gehweg"), teils Fliesstext. Ein Katalogwert "Vollsperrung Gehweg" wuerde ueber
// die Freitext-Heuristik in makeNormalized zu einer Fahrbahn-Vollsperrung (gleicher Fehler wie
// bei Heidelberg 0227). Der engine-seitige Geh-/Radweg-Filter greift hier nicht zuverlaessig,
// weil im Beschreibungstext danach fast immer das Wort "Strasse" faellt und der Filter das als
// Fahrbahnbezug liest. Deshalb setzt der Connector den Sperrgrad bei den Katalogwerten SELBST,
// ein explizites false gewinnt gegen den Freitext-Nachzug. Fliesstext bleibt der Heuristik
// ueberlassen, weil dort die Sperrung tatsaechlich beschrieben wird.

import { makeNormalized, getText, stripHtml, dateOnly } from "./_helpers.js"

const QUELLE = "0231"
const QUELLE_NAME = "Saarbruecken — Baustellen (Landeshauptstadt Saarbruecken)"
const BASE = "https://www.saarbruecken.de/leben_in_saarbruecken/planen_bauen_wohnen/baustellen_bauprojekte_und_verkehr"
const DETAIL = `${BASE}/baustellen_detailseite/construction_site-`
const QUELLE_URL = BASE

// Deutsche Anfuehrungszeichen als benannte Entity — die einzigen beiden, die decodeEntities in
// _helpers nicht kennt und die im Bestand vorkommen (bdquo 8x, ldquo 8x, gemessen 06.09.2026).
// Ohne diesen Schritt steht "&bdquo;Ilseplatz&ldquo;" roh im Popup.
const ZUSATZ_ENTITIES = { bdquo: "„", ldquo: "“", rdquo: "”", sbquo: "‚", lsquo: "‘", rsquo: "’" }
const text = (roh) =>
  stripHtml(String(roh ?? "").replace(/&([A-Za-z]+);/g, (m, n) => ZUSATZ_ENTITIES[n] ?? m))

/** Wert eines <dt>Label:</dt><dd>…</dd>-Paars. `label` ist ein festes Muster aus dieser Datei
 *  (nie Quelltext), damit es gefahrlos in die Regex eingesetzt werden kann. */
function feld(html, label) {
  const m = html.match(new RegExp(`<dt>\\s*${label}\\s*:?\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`, "i"))
  return m ? text(m[1]) : null
}

/** Inhalt eines <section>-Blocks hinter seiner <h3>-Ueberschrift. */
function abschnitt(html, ueberschrift) {
  const m = html.match(new RegExp(`<h3>\\s*${ueberschrift}\\s*</h3>([\\s\\S]*?)</section>`, "i"))
  return m ? text(m[1]) : null
}

// Die kurzen Katalogwerte des Verkehrslage-Feldes. Nur ein VOLLSTAENDIGER Treffer zaehlt: ein
// unbekannter Wert soll nicht halb erraten, sondern der Freitext-Heuristik ueberlassen werden.
const KATALOG = [
  [/^Vollsperrung\s+(?:der\s+)?(?:Stra(?:ß|ss)e|Fahrbahn)$/i, { vollsperrung: true }],
  [/^Vollsperrung\s+(?:des\s+)?(?:Gehwegs?|Gehsteigs?|B(?:ü|ue)rgersteigs?|Fu(?:ß|ss)wegs?|Radwegs?)$/i, { vollsperrung: false }],
  [/^Teilsperrung\s+(?:der\s+)?(?:Stra(?:ß|ss)e|Fahrbahn)$/i, { vollsperrung: false, halbseitig: true }],
  [/^Teilsperrung\s+(?:des\s+)?(?:Gehwegs?|Gehsteigs?|B(?:ü|ue)rgersteigs?|Fu(?:ß|ss)wegs?|Radwegs?)$/i, { vollsperrung: false }],
  [/^(?:Einengung|Verengung)\s+(?:der\s+)?(?:Stra(?:ß|ss)e|Fahrbahn)$/i, { vollsperrung: false, fahrbahnVerengt: true }],
]

/** Sperrgrad aus dem Verkehrslage-Feld — nur bei den kurzen Katalogwerten, sonst {} (Heuristik). */
function sperrgrad(verkehrslage) {
  const v = String(verkehrslage ?? "").replace(/\s+/g, " ").trim()
  if (!v || v.length > 40) return {} // Fliesstext beschreibt die Sperrung selbst → Heuristik
  for (const [re, attrs] of KATALOG) if (re.test(v)) return { ...attrs } // Kopie, die Tabelle bleibt unberuehrt
  return {}
}

/** Baustellen-Marker der Uebersichtskarte. POI-Marker derselben Karte (Parkplaetze) fallen raus,
 *  weil nur Baustellen einen Detailseiten-Link tragen. */
export function baustellenAusKarte(html) {
  const out = []
  for (const block of String(html).split("gmap('addMarker'").slice(1)) {
    const id = block.match(/construction_site-([0-9a-f]{6,})/)?.[1]
    if (!id) continue
    const pos = block.match(/'position':\s*'\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*'/)
    if (!pos) continue
    // Der Marker-Inhalt ist ein einfach gequotetes JS-String-Literal: Apostrophe darin sind escaped.
    const inhalt = block.replace(/\\'/g, "'")
    out.push({
      id,
      lat: Number(pos[1]),
      lng: Number(pos[2]),
      titel: text(inhalt.match(new RegExp(`construction_site-${id}"[^>]*>([^<]*)</a>`))?.[1]),
      code: text(inhalt.match(/Baustellencode\s*<a[^>]*>([^<]*)<\/a>/)?.[1]),
      adresse: text(inhalt.match(/data-icon="D"><\/span>\s*([^<]*)</)?.[1]),
    })
  }
  return out
}

/** Detailseite auswerten: Zeitraum, Strasse, Ortsteil, Bauherr, Beschreibung, Verkehrslage. */
export function detailAuswerten(html) {
  return {
    strasse: feld(html, "Stra(?:ß|ss)e"),
    ortsteil: feld(html, "Ortsteil"),
    stadt: feld(html, "Stadt"),
    bauherr: feld(html, "Bauherr/Projektleitung"),
    beginn: feld(html, "Arbeitsbeginn"),
    ende: feld(html, "Voraussichtliches Ende"),
    info: abschnitt(html, "Allgemeine Informationen"),
    verkehrslage: abschnitt(html, "Informationen zur Verkehrslage"),
  }
}

export const saarbrueckenBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7,13,19 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 30000, log = () => {} } = {}) {
    const html = await getText(BASE, { timeoutMs })
    // vollbestand: true — ein fehlgeschlagener Abruf darf NICHT als leerer Bestand durchgehen,
    // sonst deaktiviert der Reconcile alle Saarbruecker Baustellen ("Strecke frei").
    if (html == null) throw new Error(`${QUELLE}: Abruf ${BASE} fehlgeschlagen — Bestand unveraendert gelassen`)

    const marker = baustellenAusKarte(html)
    if (!marker.length) {
      throw new Error(`${QUELLE}: keine Baustellen-Marker in ${BASE} gefunden — Seitenaufbau geaendert`)
    }

    const obstacles = []
    let mitDetail = 0
    for (const m of marker) {
      const detailHtml = await getText(DETAIL + m.id, { timeoutMs })
      const d = detailHtml ? detailAuswerten(detailHtml) : {}
      if (d.beginn || d.ende) mitDetail++
      // Der Titel allein ("Kanalreparatur") verortet nichts — die Strasse gehoert in den Namen,
      // sonst steht auf der Karte ein Label ohne Ort.
      const ort = d.strasse || m.adresse
      const name = [m.titel, ort].filter(Boolean).join(", ") || "Baustelle"
      const beschreibung = [d.info, d.verkehrslage, d.ortsteil ? `Ortsteil ${d.ortsteil}` : null]
        .filter(Boolean).join("\n") || null
      const grad = sperrgrad(d.verkehrslage)
      const von = dateOnly(d.beginn)
      obstacles.push(makeNormalized({
        // Die Detailseiten-ID steht in der kanonischen URL des Datensatzes und bleibt ueber
        // Laeufe stabil (45 Marker, 45 verschiedene IDs, gemessen 06.09.2026). Kein
        // Geometrie-Suffix: bei eindeutiger Quell-ID wuerde es nur Churn erzeugen, sobald die
        // Stadt einen Marker um ein paar Meter verschiebt.
        externeId: `sb#${m.id}`,
        // Wie in 0119/0127/0224/0226: 'sperrung' nur bei der vom Connector SELBST festgestellten
        // Vollsperrung. Die aus dem Fliesstext abgeleiteten Vollsperrungen bleiben 'baustelle' und
        // werden von ruleBaustelle ueber attrs.vollsperrung eskaliert (T-265) — die Bewertung
        // haengt an den attrs, nicht an der Kategorie.
        kategorie: grad.vollsperrung === true ? "sperrung" : "baustelle",
        name,
        beschreibung,
        lat: Number.isFinite(m.lat) ? m.lat : null,
        lng: Number.isFinite(m.lng) ? m.lng : null,
        strassenRef: null,
        // T-618: reine Stadt-Quelle. Im Beschreibungstext ist ein "A 623" eine Umleitungs- oder
        // Nachbarschaftsangabe ("Die Autobahnauffahrt A 623 ist nicht erreichbar"), nie die
        // Strasse der Baustelle selbst — sonst landet eine Wohnstrassen-Baustelle auf der Autobahn.
        refAusBeschreibung: false,
        attrs: grad,
        gueltigVon: von,
        gueltigBis: dateOnly(d.ende),
        realerStart: von,
        roh: { baustellencode: m.code, adresse: m.adresse, ...d },
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }

    // Ohne eine einzige lesbare Detailseite fehlen ALLE Zeitraeume — dann ist der Seitenaufbau
    // gewechselt und nicht bloss ein einzelner Abruf verunglueckt. Lieber fehlschlagen als 45 Baustellen
    // ohne Enddatum in den Bestand schreiben, die dann dauerhaft als aktiv gelten.
    if (mitDetail === 0) {
      throw new Error(`${QUELLE}: ${marker.length} Marker, aber keine einzige Detailseite mit Zeitraum — Seitenaufbau geaendert`)
    }
    if (mitDetail < marker.length) {
      log(`${QUELLE}: WARN ${marker.length - mitDetail} von ${marker.length} Detailseiten ohne Zeitraum`)
    }
    const ids = new Set(obstacles.map((o) => o.externeId))
    if (ids.size !== obstacles.length) {
      log(`${QUELLE}: WARN externeId-Kollision — ${obstacles.length} Marker, ${ids.size} distinct`)
    }
    log(`${QUELLE}: ${obstacles.length} Baustellen (${mitDetail} mit Zeitraum)`)
    return { obstacles }
  },
}
