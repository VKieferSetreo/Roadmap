// Connector Quelle 0232: VMZ Bremen — Durchfahrtshoehen und Baustellen (Land Bremen inkl. Bremerhaven).
//
// LIZENZ — VOR DER REGISTRIERUNG LESEN (T-549/T-557, geprueft 06.09.2026):
// Die Quelle ist NICHT fuer kommerzielle Nutzung freigegeben. vmz.bremen.de weist im Impressum
// "Creative Commons Nicht-Kommerziell Keine Bearbeitung" (CC BY-NC-ND) aus und ergaenzt: "Die
// Vervielfaeltigung und Verbreitung ist nur mit Genehmigung der Verkehrsmanagementzentrale (VMZ)
// Bremen". Damit gehoert die Quelle NUR mit nur_intern=true ins Quellenregister (rotes
// "Intern"-Badge), analog 0158 VMZ Niedersachsen. Sie darf nicht in kommerzielle Ausgaben laufen,
// bevor das ASV Bremen (VMZ@ASV.Bremen.de) zugestimmt hat — genau das ist der offene Auftrag in T-557.
//
// HEBEL FUER T-557: dieselbe VMZ Bremen stellt ihre Baustellen als Angebot 608390979298140160 auf
// der Mobilithek ein, dort ausgezeichnet mit "dl-by-de/2.0" (Datenlizenz Deutschland Namensnennung
// 2.0) — die erlaubt kommerzielle Nutzung ausdruecklich. Es gibt also bereits eine Selbstdeklaration
// der VMZ, die dem NC-ND-Fussbereich der Webseite widerspricht. Das Mobilithek-Angebot ist fuer uns
// aktuell nicht abrufbar (Client-Pull ueber mTLS, MOBILITHEK_CERT/KEY fehlen), taugt aber als
// Argument in der Behoerdenanfrage. Sobald das ASV zustimmt oder ein Zertifikat da ist, faellt
// nur_intern weg bzw. der Bezug wandert auf makeMobilithekConnector.
//
// WARUM DIESE QUELLE UND KEINE ANDERE (Recherche 06.09.2026, alle Wege abgeklopft):
//   - ASV-PDF "Straßenverzeichnis gewichtsbeschr. Straßen" (Stand 22.11.2022, 40 Seiten) ist weiter
//     der einzige Traeger der Bremer Tonnage-Werte, hat aber nach wie vor KEINE Koordinaten
//     (Strassenname + Bezirk + t) — der Grund, aus dem T-549 zurueckgestellt wurde. Unveraendert.
//   - Verkehrszeichenkataster "Straßenbefahrungen Verkehrszeichen" (geoportal.bremen.de/strbef):
//     traegt StVO-Zeichennummern, ist aber WMS-only (WFS liefert InvalidRequest) und laut Metadaten
//     "nur innerbehoerdlich und in Absprache mit dem Dateneigentuemer (ASV)" nutzbar.
//   - INSPIRE-Downloaddienst Strassennetz (CC-BY, ASV): reines Knoten-Kanten-Modell von 2019,
//     41.117 Objekte, KEIN einziges RestrictionForVehicles → keine Restriktion, kein Mass.
//   - Lkw-Netz Stadt Bremen: Datensatz gebuehrenpflichtig, WMS-Host gdi1.geo.bremen.de tot (DNS).
//   - Transparenzportal Bremen: 168 Datensaetze, keiner mit Verkehrsrestriktionen.
//   - SEVAS (vgl. 0157) deckt ausschliesslich NRW ab, Bremen nimmt nicht teil.
//
// AUFBAU: zwei offene GeoJSON-Feeds des mapsight-Viewers, WGS84 direkt, kein Auth.
// Live-Verkehr bleibt draussen (Max-Regel): die Icons "meldung" (Autobahn-Meldungen A1/A27/A270/A281,
// doppeln unsere Autobahn-Feeds) und "sport" (Demonstrationen, Umzuege, autofreier Sonntag) werden
// verworfen, ebenso die Feeds traffic*/traffic-messages*.

import { makeNormalized, getJson, dateOnly, num } from "./_helpers.js"

const QUELLE = "0232"
const QUELLE_NAME = "VMZ Bremen — Durchfahrtshöhen und Baustellen (ASV Bremen)"
const QUELLE_URL = "https://vmz.bremen.de/"
const FEED_HOEHEN = "https://vmz.bremen.de/geojson/pois-vertical-clearance.geojson"
// Der Vorschau-Feed ist eine echte Obermenge des Aktuell-Feeds (gemessen 06.09.2026: alle 214 IDs
// aus construction-work.geojson stecken in den 317 von construction-work-preview.geojson). Ein
// Abruf statt zwei, und die geplanten Massnahmen kommen gratis mit — die Zeitraeume stehen ohnehin
// strukturiert in `when`, die Engine entscheidet ueber gueltigVon/gueltigBis.
const FEED_BAUSTELLEN = "https://vmz.bremen.de/geojson/construction-work-preview.geojson"

// mapsightIconId → Kategorie/Label/attrs. Was hier nicht steht, wird verworfen:
// "meldung" = Autobahn-Dauerbaustellen (haben wir ueber die Autobahn-Feeds) und einzelne
// Veranstaltungen, "sport" = Demonstrationen/Umzuege. Beides ist kein Fahrbahn-Planungsdatum.
const ICON_MAP = {
  baustelle: { kat: "baustelle", label: "Baustelle" },
  fahrbahnverengung: { kat: "baustelle", label: "Fahrbahnverengung", attrs: { fahrbahnVerengt: true } },
  vollsperrung: { kat: "sperrung", label: "Vollsperrung", attrs: { vollsperrung: true } },
  // Eine bauzeitlich angeordnete Einbahnfuehrung ist eine Fahrbahn-Massnahme, kein Live-Verkehr —
  // die Fahrbahn traegt in dieser Zeit nur noch eine Richtung. Kategorie bleibt Baustelle.
  einbahnstrasse: { kat: "baustelle", label: "Einbahnstraßenregelung", attrs: { einbahnstrasse: true } },
}

// Autobahn-Massnahmen raus (Dedup, gleiche Logik wie 0158 gegen 0140): die BAB im Land Bremen
// (A1/A27/A270/A281) liegen bei der Autobahn GmbH und kommen ueber unsere Autobahn-Feeds herein.
// Das Icon "meldung" faengt die meisten schon ab; dieser Guard holt die restlichen (gemessen
// 06.09.2026: 1 von 298). B-Strassen bleiben drin — die sind in Bremen ASV-Zustaendigkeit.
const BAB_NAME = /^\s*A\s?\d{1,3}\b/

// Trenner, hinter denen im VMZ-Namensschema nicht mehr die Strasse des Fundes steht, sondern die
// Quer-/Zielstrasse, eine Hausnummer oder eine Lagebeschreibung ("… zwischen B75 und Huchtinger
// Heerstraße", "… in Höhe Haus-Nr. 8 - 10", "Am Weserhof / Unterführung A1", "Keithstraße der
// komplette Straßenzug / Seydlitzstraße"). Ohne diesen Schnitt zieht makeNormalized die im Namen
// genannte B-/A-Strasse als strassenRef und schiebt eine innerstaedtische Baustelle auf die Autobahn
// (T-618). Darum wird strassenRef hier IMMER explizit gesetzt, nie der Extraktion ueberlassen.
const REF_TRENNER =
  /\s+(?:zwischen|in\s+H(?:ö|oe)he|im\s+Bereich|Teilst(?:ü|ue)ck|Stichstra(?:ß|ss)en?|der\s+komplette|Einm(?:ü|ue)ndung|Kreuzung|Auffahrt|Abfahrt|Unterf(?:ü|ue)hrung|Haus-Nr|Richtung|ab|bis)\b|\s*(?:->|\/|,|\()/iu
// Die VMZ stellt Bremerhavener Massnahmen mit dem Stadtnamen voran ("Bremerhaven - Weserstraße /
// Lindenallee"). Das Praefix ist kein Strassenbestandteil und wird abgeschnitten.
const ORT_PRAEFIX = /^Bremerhaven\s*[-–]\s*/i

/** Fuehrendes Strassenstueck aus dem VMZ-Namen (max. 80 Zeichen, nie leer). */
function strasseAusName(name) {
  const roh = String(name ?? "").replace(/\s+/g, " ").trim().replace(ORT_PRAEFIX, "")
  if (!roh) return null
  const i = roh.search(REF_TRENNER)
  const kopf = (i > 0 ? roh.slice(0, i) : roh).trim()
  return (kopf || roh).slice(0, 80)
}

/** Erster Punkt einer Point-/GeometryCollection-Geometrie → [lat, lng]. */
function latLng(geom) {
  if (!geom) return [null, null]
  const teile = geom.type === "GeometryCollection" ? (geom.geometries ?? []) : [geom]
  const punkt = teile.find((g) => g?.type === "Point") ?? teile[0]
  let c = punkt?.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  const lng = Number(c?.[0]), lat = Number(c?.[1])
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : [null, null]
}

/** Streckengeometrie (Linie) aus der GeometryCollection — der Punkt ist nur der Kartenmarker. */
function linieAus(geom) {
  if (!geom) return null
  if (geom.type === "LineString" || geom.type === "MultiLineString") return geom
  if (geom.type !== "GeometryCollection") return null
  const linien = (geom.geometries ?? []).filter((g) => g?.type === "LineString" && Array.isArray(g.coordinates))
  if (!linien.length) return null
  return linien.length === 1 ? linien[0] : { type: "MultiLineString", coordinates: linien.map((l) => l.coordinates) }
}

/** Lichte Hoehe eines POI in Metern, konservativ.
 *  Das Strukturfeld `height_restriction` und die Zahl im Namen weichen vereinzelt voneinander ab
 *  (poi-vmz-hb-685 "Oslebshauer Tor: 3,8m" fuehrt height_restriction=4). Fuer einen Transport ist
 *  die NIEDRIGERE Angabe die bindende — lieber zu frueh warnen als eine Kollision uebersehen.
 *  Plausibilitaetsfenster wie 0133: unter 2 m ist kein befahrbares Bauwerk, ueber 10 m kein Limit. */
function hoeheAus(p) {
  const ausFeld = num(p?.height_restriction)
  const m = String(p?.name ?? "").replace(",", ".").match(/(\d{1,2}(?:\.\d{1,2})?)\s*m\b/i)
  const ausName = m ? Number(m[1]) : null
  const werte = [ausFeld, ausName].filter((v) => Number.isFinite(v) && v >= 2.0 && v <= 10.0)
  return werte.length ? Math.min(...werte) : null
}

/** Pure Parse: Durchfahrtshoehen-POIs → Obstacles. Testbar ohne Netz. */
export function parseHoehen(features) {
  const obstacles = []
  const gesehen = new Set()
  for (const f of Array.isArray(features) ? features : []) {
    const p = f?.properties ?? {}
    const hoehe = hoeheAus(p)
    if (hoehe == null) continue
    const [lat, lng] = latLng(f.geometry)
    if (lat == null) continue
    const eid = String(p.id ?? "")
    if (!eid || gesehen.has(eid)) continue
    gesehen.add(eid)
    // Name bewusst ohne die "3,8m"-Endung: der Wert steht strukturiert in attrs, im Freitext
    // waere er nur eine zweite Wahrheit (und im Konfliktfall die falsche, s. hoeheAus).
    const ort = String(p.name ?? "").replace(/[:\s]\s*\d{1,2}(?:[.,]\d{1,2})?\s*m\.?\s*$/i, "").trim()
    obstacles.push(makeNormalized({
      externeId: eid,
      kategorie: "bruecke", // ruleBauwerk wertet maxHoeheM → Fund nur bei Transporthoehe > lichter Hoehe
      name: `Durchfahrtshöhe ${hoehe.toFixed(1).replace(".", ",")} m — ${ort || "Bremen"}`,
      lat, lng,
      strassenRef: strasseAusName(ort),
      attrs: { maxHoeheM: hoehe },
      roh: { id: p.id, name: p.name, height_restriction: p.height_restriction, permanentLink: p.permanentLink },
      quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
    }))
  }
  return obstacles
}

/** Pure Parse: Baustellen-Features → Obstacles (ohne Live-Verkehr/Veranstaltungen). Testbar ohne Netz. */
export function parseBaustellen(features) {
  const obstacles = []
  const gesehen = new Set()
  for (const f of Array.isArray(features) ? features : []) {
    const p = f?.properties ?? {}
    const map = ICON_MAP[p.mapsightIconId]
    if (!map) continue
    if (BAB_NAME.test(String(p.name ?? ""))) continue
    const [lat, lng] = latLng(f.geometry)
    if (lat == null) continue
    const eid = String(p.id ?? "")
    if (!eid || gesehen.has(eid)) continue
    gesehen.add(eid)
    const von = dateOnly(f?.when?.start)
    obstacles.push(makeNormalized({
      externeId: eid,
      kategorie: map.kat,
      name: String(p.name ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || `${map.label} (Bremen)`,
      // Fester Label-Satz statt Quell-Freitext: der Feed liefert ohnehin keine Beschreibung, und ein
      // Satz ohne m-/t-Token kann in extractStammdaten keinen Scheinwert erzeugen (Lektion 0156/0158).
      beschreibung: `${map.label} (VMZ Bremen).`,
      lat, lng,
      geom: linieAus(f.geometry), // Streckenabschnitt, wenn die Quelle einen mitliefert
      strassenRef: strasseAusName(p.name),
      attrs: { ...(map.attrs || {}) },
      gueltigVon: von,
      gueltigBis: dateOnly(f?.when?.end),
      realerStart: von,
      roh: { id: p.id, name: p.name, listInformation: p.listInformation, art: p.mapsightIconId, permanentLink: p.permanentLink },
      quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
    }))
  }
  return obstacles
}

export const vmzBremenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7,13 * * *", // Baustellenbestand aendert sich taeglich, die Hoehen-POIs praktisch nie
  vollbestand: true, // beide Feeds sind Voll-Bestaende → Reconcile raeumt beendete Massnahmen

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const [hoehenFeed, bauFeed] = await Promise.all([
      getJson(FEED_HOEHEN, { timeoutMs }),
      getJson(FEED_BAUSTELLEN, { timeoutMs }),
    ])
    // vollbestand: true — ein halber Abruf darf NICHT als geschrumpfter Bestand durchgehen, sonst
    // deaktiviert der Reconcile die Gegenseite ("Strecke frei"). complete:false ueberspringt ihn.
    if (!hoehenFeed || !bauFeed) {
      const tot = [!hoehenFeed && "Durchfahrtshöhen", !bauFeed && "Baustellen"].filter(Boolean).join(" + ")
      log(`${QUELLE}: Feed nicht erreichbar (${tot}) — Teilbestand, Reconcile übersprungen`)
      return { obstacles: [], complete: false }
    }
    const hoehenFeats = hoehenFeed.features ?? []
    const bauFeats = bauFeed.features ?? []
    const hoehen = parseHoehen(hoehenFeats)
    const baustellen = parseBaustellen(bauFeats)
    log(
      `${QUELLE}: ${hoehen.length} Durchfahrtshöhen aus ${hoehenFeats.length} POIs · ` +
      `${baustellen.length} Baustellen aus ${bauFeats.length} Features (Meldung/Veranstaltung raus)`,
    )
    return { obstacles: [...hoehen, ...baustellen] }
  },
}
