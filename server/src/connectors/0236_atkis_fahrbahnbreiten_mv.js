// Connector Quelle 0236: ATKIS Fahrbahnbreiten Mecklenburg-Vorpommern (LAiV M-V) — schmale Abschnitte
// im klassifizierten Netz (T-729). Warum mit Toleranzband und was nicht hereinkommt: _atkisBreiten.js.
//
// DIENST: AAA-Suite WFS 2.0 des LAiV ("WFS_MV_Basis-DLM_SF"), NAS-Schema. Die Breite steht an
// adv:AX_Strassenachse, Widmung und Bezeichnung an adv:AX_Strasse (istTeilVon). Der Dienst loest den
// Join im Filter selbst auf (adv:istTeilVon/adv:AX_Strasse/adv:widmung); die Bezeichnung holt eine
// zweite Abfrage. Nur EPSG:25833/5650, daher Umrechnung aus UTM 33. fahrtrichtung ist nie belegt,
// Rampen erkennt man nur an einem Fahrstreifen.
// Gemessen 13.09.2026: 40.290 klassifizierte Achsen, 79 % mit Breite; 3.508 im Band 2,5-4,0 m, davon
// 1.328 Kreisstrassen mit genau 3,0 m, viele unter Alleen (im Luftbild nicht sichtbar, also geschaetzt).
//
// LIZENZ: CC BY 4.0, Quellenvermerk "© GeoBasis-DE/M-V" (Metadatensatz 3c9a82ad-…, GetCapabilities).
// Kommerzielle Nutzung erlaubt.

import { utmZuWgs84 } from "./_helpers.js"
import { breitenFilter, feld, hindernisAusZug, holeFeatures, linien, verkette, BREITE_MAX_M, BREITE_MIN_M, WIDMUNGEN } from "./_atkisBreiten.js"

const QUELLE = "0236"
const QUELLE_NAME = "Mecklenburg-Vorpommern — Fahrbahnbreiten ATKIS Basis-DLM (© GeoBasis-DE/M-V, CC BY 4.0)"
const QUELLE_URL = "https://www.geoportal-mv.de"
const WFS = "https://www.geodaten-mv.de/dienste/atkis_bdlm_wfs_sf"
const NS = 'xmlns:adv="http://www.adv-online.de/namespaces/adv/gid/7.1"'
const SRS = "urn:ogc:def:crs:EPSG::25833"

/** AX_Strasse-Member → [oid, {widmung, bezeichnung}]. */
export function strasseMv(member) {
  const id = member.match(/<AX_Strasse\b[^>]*gml:id="([^"]+)"/)?.[1]
  if (!id) return null
  return [`urn:adv:oid:${id}`, { widmung: feld(member, "widmung"), bezeichnung: feld(member, "bezeichnung") }]
}

/** Ein AX_Strassenachse-Member → {achsen} oder {grund}. */
export function achseMv(member, strassen) {
  const breite = Number(feld(member, "breiteDerFahrbahn"))
  if (!(breite >= BREITE_MIN_M && breite <= BREITE_MAX_M)) return { grund: "breite" }
  if (Number(feld(member, "anzahlDerFahrstreifen")) === 1) return { grund: "einstreifig" }
  // Eine Achse kann zu mehreren Strassen gehoeren; die erste klassifizierte zaehlt.
  const strasse = [...member.matchAll(/<istTeilVon\b[^>]*xlink:href="([^"]+)"/g)]
    .map((m) => strassen.get(m[1]))
    .find((s) => s && WIDMUNGEN.includes(s.widmung))
  if (!strasse) return { grund: "strasse" }
  const teile = linien(member, (e, n) => utmZuWgs84(e, n, 33))
  if (!teile.length) return { grund: "geometrie" }
  // Mehrteilige Geometrie (selten) wird zu je einer Achse pro Teil — zusammengeklebt entstuende ein
  // Sprungsegment, das der Kreuzungsfilter der Engine als Querlauf liest.
  const id = member.match(/<AX_Strassenachse\b[^>]*gml:id="([^"]+)"/)?.[1]
  const gemeinsam = {
    widmung: strasse.widmung,
    bezeichnung: strasse.bezeichnung,
    breite,
  }
  return { achsen: teile.map((punkte, i) => ({ ...gemeinsam, id: teile.length > 1 ? `${id}.${i}` : id, punkte })) }
}

export const atkisFahrbahnbreitenMvConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "45 4 * * 2",
  vollbestand: true,

  async fetch({ timeoutMs = 120000, log = () => {} } = {}) {
    const lit = (w) => `<fes:PropertyIsEqualTo><fes:ValueReference>adv:widmung</fes:ValueReference><fes:Literal>${w}</fes:Literal></fes:PropertyIsEqualTo>`
    const strassenMembers = await holeFeatures(WFS, {
      namespaces: NS,
      typeName: "adv:AX_Strasse",
      srsName: SRS,
      filter: `<fes:Filter><fes:Or>${WIDMUNGEN.map(lit).join("")}</fes:Or></fes:Filter>`,
      timeoutMs,
      log,
    })
    const strassen = new Map(strassenMembers.map(strasseMv).filter(Boolean))
    const members = await holeFeatures(WFS, {
      namespaces: NS,
      typeName: "adv:AX_Strassenachse",
      srsName: SRS,
      filter: breitenFilter("adv:istTeilVon/adv:AX_Strasse/adv:widmung", "adv:breiteDerFahrbahn"),
      timeoutMs,
      log,
    })
    if (!members.length || !strassen.size) {
      throw new Error(`${QUELLE}: WFS lieferte ${members.length} Achsen / ${strassen.size} Strassen — Bestand unveraendert gelassen`)
    }

    const achsen = []
    const verworfen = {}
    for (const m of members) {
      const r = achseMv(m, strassen)
      if (r.achsen) achsen.push(...r.achsen)
      else verworfen[r.grund] = (verworfen[r.grund] ?? 0) + 1
    }
    const obstacles = verkette(achsen)
      .map((z) => hindernisAusZug(z, { land: "Mecklenburg-Vorpommern", quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL }))
      .filter(Boolean)
    log(`${QUELLE}: ${strassen.size} Strassen · ${members.length} Achsen · ${achsen.length} uebernommen · ${obstacles.length} Abschnitte · verworfen ${JSON.stringify(verworfen)}`)
    return { obstacles }
  },
}
