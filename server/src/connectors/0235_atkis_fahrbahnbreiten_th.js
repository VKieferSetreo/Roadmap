// Connector Quelle 0235: ATKIS Fahrbahnbreiten Thueringen (GDI-Th) — schmale Abschnitte im
// klassifizierten Netz (T-729). Warum mit Toleranzband und was nicht hereinkommt: _atkisBreiten.js.
//
// DIENST: deegree WFS 2.0 der GDI-Th, nur GML 3.2, flaches Schema — Widmung, Bezeichnung
// ("K128", "B7#E40"), BreiteDerFahrbahn, AnzahlDerFahrstreifen und Fahrtrichtung stehen direkt an
// dlm:AX_STRASSENACHSE. Fehlwert -9998. Mit srsName EPSG:4326 kommt posList als "lat lon".
// Gemessen 13.09.2026: 58.205 klassifizierte Achsen, 98,6 % mit Breite; 5.230 im Band 2,5-4,0 m.
//
// LIZENZ: dl-de/by-2-0, Namensnennung "© GDI-Th" (GetCapabilities, ows:Fees), AccessConstraints
// "NONE". Kommerzielle Nutzung erlaubt.

import { breitenFilter, feld, hindernisAusZug, holeFeatures, linien, verkette, BREITE_MAX_M, BREITE_MIN_M } from "./_atkisBreiten.js"

const QUELLE = "0235"
const QUELLE_NAME = "Thüringen — Fahrbahnbreiten ATKIS Basis-DLM (© GDI-Th, dl-de/by-2-0)"
const QUELLE_URL = "https://www.geoportal-th.de"
const WFS = "https://www.geoproxy.geoportal-th.de/geoproxy/services/adv_atkis_wfs"

/** Ein AX_STRASSENACHSE-Member → {achsen} oder {grund}. */
export function achseTh(member) {
  const breite = Number(feld(member, "dlm:BreiteDerFahrbahn"))
  if (!(breite >= BREITE_MIN_M && breite <= BREITE_MAX_M)) return { grund: "breite" }
  // Fahrtrichtung 1 = nur in Digitalisierrichtung befahrbar: Rampe oder geteilte Fahrbahn.
  if (Number(feld(member, "dlm:Fahrtrichtung")) === 1) return { grund: "einbahn" }
  if (Number(feld(member, "dlm:AnzahlDerFahrstreifen")) === 1) return { grund: "einstreifig" }
  const teile = linien(member, (lat, lng) => [lng, lat])
  if (!teile.length) return { grund: "geometrie" }
  // Mehrteilige Geometrie (selten) wird zu je einer Achse pro Teil — zusammengeklebt entstuende ein
  // Sprungsegment, das der Kreuzungsfilter der Engine als Querlauf liest.
  const id = feld(member, "dlm:eindeutigerObjektidentifikator")
  const gemeinsam = {
    widmung: feld(member, "dlm:Widmung"),
    // "B7#E40": die Europastrasse ist eine Zweitbezeichnung, massgeblich ist die Bundesstrasse.
    bezeichnung: feld(member, "dlm:Bezeichnung")?.split("#")[0]?.trim() || null,
    breite,
  }
  return { achsen: teile.map((punkte, i) => ({ ...gemeinsam, id: teile.length > 1 ? `${id}.${i}` : id, punkte })) }
}

export const atkisFahrbahnbreitenThConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  // Landschaftsmodell, Aktualisierung in Zyklen von Monaten. Woechentlich wie 0234.
  schedule: "30 4 * * 2",
  vollbestand: true,

  async fetch({ timeoutMs = 120000, log = () => {} } = {}) {
    const members = await holeFeatures(WFS, {
      namespaces: 'xmlns:dlm="http://www.adv-online.de/namespaces/adv/gid/7.1/dlm"',
      typeName: "dlm:AX_STRASSENACHSE",
      srsName: "urn:ogc:def:crs:EPSG::4326",
      filter: breitenFilter("dlm:Widmung", "dlm:BreiteDerFahrbahn"),
      timeoutMs,
      log,
    })
    // Ein leerer Abzug ist bei einem Landschaftsmodell kein Ergebnis, sondern ein Fehler: der
    // Vollbestand-Abgleich wuerde sonst jede thueringische Engstelle deaktivieren.
    if (!members.length) throw new Error(`${QUELLE}: WFS lieferte 0 Achsen — Bestand unveraendert gelassen`)

    const achsen = []
    const verworfen = {}
    for (const m of members) {
      const r = achseTh(m)
      if (r.achsen) achsen.push(...r.achsen)
      else verworfen[r.grund] = (verworfen[r.grund] ?? 0) + 1
    }
    const obstacles = verkette(achsen)
      .map((z) => hindernisAusZug(z, { land: "Thüringen", quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL }))
      .filter(Boolean)
    log(`${QUELLE}: ${members.length} Achsen · ${achsen.length} uebernommen · ${obstacles.length} Abschnitte · verworfen ${JSON.stringify(verworfen)}`)
    return { obstacles }
  },
}
