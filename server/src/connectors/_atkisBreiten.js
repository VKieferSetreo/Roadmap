// Gemeinsamer Teil der ATKIS-Fahrbahnbreiten (T-729): 0235 Thueringen, 0236 Mecklenburg-Vorpommern.
//
// WAS DIE DATEN SIND: die Strassenachsen des amtlichen Landschaftsmodells (ATKIS Basis-DLM) mit dem
// Attribut "Breite der Fahrbahn" — laut Objektartenkatalog "die Breite der befestigten Flaeche in
// Meter, auf 0,5 Meter gerundet", aus dem Luftbild erfasst. Gemessen wird die GANZE Fahrbahn einer
// Strasse mit Gegenverkehr; bei baulich getrennten Richtungsfahrbahnen traegt die Achse keine Breite.
//
// WARUM NICHT WIE BAYSIS (0234): dort sind die Breiten amtlich gemessen, hier geschaetzt. Gegen die
// BAYSIS-Messwerte gehalten (ATKIS Bayern, drei Gebiete, 6.041 Paare, 13.09.2026) liegt ATKIS nur in
// 37-44 % innerhalb der versprochenen 0,25 m, in 75-87 % innerhalb 1 m, und meist ZU SCHMAL. In TH
// liegen 76 % der Werte auf ganzen Metern, in MV 90-100 %. Deshalb wandert der Messfehler als
// Toleranzband mit (breiteToleranzUntenM/ObenM), und ruleEngstelle rechnet mit beiden Grenzen:
// Warnung aus der Untergrenze, kritisch nur, wenn selbst die Obergrenze nicht reicht.
//
// WAS NICHT HEREINKOMMT:
//  - Autobahnen (1301) und Gemeindestrassen (1307): Autobahn-Achsen mit Breite sind Einbahn-Rampen,
//    Gemeindestrassen sind nicht das Netz eines Grossraumtransports.
//  - Einbahn-Achsen und einstreifige Achsen: Rampen und Fahrbahnteilungen, keine schmale Strecke.
//  - Werte ueber 4,0 m: ein gerundetes 4,5 ist in Bayern zu 92 % real mindestens 5,0 m breit.
//  - Werte unter 2,5 m: Erfassungsluecke wie in 0234 (MIN_PLAUSIBEL_M), keine Kreisstrasse.
//
// GEOMETRIE: die Achse geht als Linie mit, und die Engine prueft sie wie jede Linie. Eine Achse ist in
// beliebiger Richtung digitalisiert; der Gegenfahrbahn-Filter wertet aber erst ab 8 m Versatz, und so
// weit liegen OSM-Routen nicht daneben (gemessen an vier TH-Projekten, 1.804 Routenpunkte auf dem
// klassifizierten Netz: Median 0,3 m, P95 1,9 m). Quer abgehende schmale Strassen an einer
// Einmuendung fallen ueber den Kreuzungsfilter heraus.
//
// BLIND FUER PUNKTUELLE ENGSTELLEN: 97,9 % der BAYSIS-Engstellen unter 4,5 m sind kurze
// Fahrbahnteilungen an Inseln, die ATKIS gar nicht modelliert. Diese Quelle meldet "durchgehend
// schmaler Abschnitt", nie "hier ist es frei" — ein Abschnitt ohne Fund ist NICHT geprueft.

import { makeNormalized, stabilHash, inDeBbox } from "./_helpers.js"
import { normRoadRef } from "../external/osrm.js"
import { haversineKm } from "../engine/geometry.js"

export const BREITE_MIN_M = 2.5
export const BREITE_MAX_M = 4.0
/** Aus dem Bayern-Abgleich: in rund 95 % ist die echte Fahrbahn hoechstens 0,5 m schmaler als der
 *  Wert, in 78-91 % hoechstens 1,0 m breiter. */
export const TOLERANZ_UNTEN_M = 0.5
export const TOLERANZ_OBEN_M = 1.0
export const WIDMUNGEN = ["1303", "1305", "1306"]
const WIDMUNG_WORT = { 1303: "Bundesstraße", 1305: "Landesstraße", 1306: "Kreisstraße" }

/** Obergrenze der Antwort. Beide Dienste liefern den ganzen Bestand in einer Anfrage (TH 5.230 in
 *  7 s, MV 3.508 Achsen in 3,5 s und 9.529 Strassen in 1,6 s). Paging ohne stabile Sortierung
 *  koennte Features verschieben — ein fehlendes Feature waere im Vollbestand-Abgleich eine
 *  deaktivierte Engstelle. MV lehnt count=50000 mit HTTP 400 ab, 30000 geht. Waechst ein Bestand
 *  darueber, schlaegt die Vollstaendigkeitspruefung laut an, statt still abzuschneiden. */
const MAX_FEATURES = 30000

const lit = (op, ref, wert) =>
  `<fes:${op}><fes:ValueReference>${ref}</fes:ValueReference><fes:Literal>${wert}</fes:Literal></fes:${op}>`

/** Filter: Widmung klassifiziert UND Breite im Band. `widmungRef`/`breiteRef` sind je Dienst verschieden. */
export function breitenFilter(widmungRef, breiteRef) {
  return (
    `<fes:Filter><fes:And><fes:Or>${WIDMUNGEN.map((w) => lit("PropertyIsEqualTo", widmungRef, w)).join("")}</fes:Or>` +
    lit("PropertyIsGreaterThanOrEqualTo", breiteRef, BREITE_MIN_M.toFixed(1)) +
    lit("PropertyIsLessThanOrEqualTo", breiteRef, BREITE_MAX_M.toFixed(1)) +
    `</fes:And></fes:Filter>`
  )
}

/** Ein WFS-2.0-GetFeature per POST (die Filter sind fuer GET zu lang, der Dienst antwortet mit 414). */
export async function holeFeatures(url, { namespaces, typeName, srsName, filter, timeoutMs = 120000, pauseMs = 2000, log = () => {} }) {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><wfs:GetFeature service="WFS" version="2.0.0" count="${MAX_FEATURES}" ` +
    `xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:fes="http://www.opengis.net/fes/2.0" ${namespaces}>` +
    `<wfs:Query typeNames="${typeName}" srsName="${srsName}">${filter}</wfs:Query></wfs:GetFeature>`
  let letzterFehler
  for (let versuch = 0; versuch < 3; versuch++) {
    if (versuch > 0) {
      log(`${typeName}: Versuch ${versuch + 1}/3 nach ${letzterFehler?.message}`)
      await new Promise((r) => setTimeout(r, pauseMs * versuch))
    }
    try {
      const r = await fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "text/xml", "user-agent": "roadmap-connector/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const xml = await r.text()
      if (!r.ok || /<(?:ows:)?ExceptionReport\b/i.test(xml.slice(0, 2000))) {
        const grund = xml.match(/<(?:ows:)?ExceptionText>([^<]{0,160})/i)?.[1]?.replace(/\s+/g, " ").trim()
        throw new Error(`HTTP ${r.status}${grund ? `: ${grund}` : ""}`)
      }
      const members = xml.match(/<wfs:member>[\s\S]*?<\/wfs:member>/g) ?? []
      const matched = Number(xml.match(/numberMatched="(\d+)"/)?.[1])
      // Vollstaendig oder gar nicht: ein Teilbestand darf nie in den Abgleich.
      if (Number.isFinite(matched) && members.length !== matched) {
        throw new Error(`${members.length} von ${matched} Features geliefert — Teilbestand`)
      }
      return members
    } catch (err) {
      letzterFehler = err
    }
  }
  throw new Error(`${typeName}: Abruf fehlgeschlagen (${letzterFehler?.message}) — Bestand unveraendert gelassen`)
}

/** Inhalt eines einfachen Elements. `name` ohne Praefix-Regex-Zeichen, z.B. "dlm:Widmung". */
export function feld(member, name) {
  const m = member.match(new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`))
  return m ? m[1].trim() : null
}

/** Alle posList-Koordinaten eines Members als Teil-Linien, bereits in [lng, lat]. */
export function linien(member, zuLngLat) {
  const out = []
  for (const m of member.matchAll(/<gml:posList\b[^>]*>([^<]+)<\/gml:posList>/g)) {
    const zahlen = m[1].trim().split(/\s+/).map(Number)
    const punkte = []
    for (let i = 0; i + 1 < zahlen.length; i += 2) {
      const p = zuLngLat(zahlen[i], zahlen[i + 1])
      if (Number.isFinite(p[0]) && Number.isFinite(p[1])) punkte.push(p)
    }
    if (punkte.length >= 2) out.push(punkte)
  }
  return out
}

const knoten = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`

/**
 * Achsen gleicher Strasse und gleicher Breite zu Linienzuegen verketten.
 *
 * Die Median-Achse ist 90-175 m lang; ohne Verkettung wuerde eine 5 km lange schmale Kreisstrasse zu
 * rund 30 Funden. Verkettet wird nur ueber Knoten, an denen GENAU zwei Achsen der Gruppe enden — an
 * einer Verzweigung bricht der Zug ab. So entsteht immer ein einfacher Linienzug in Reihenfolge,
 * ohne Sprungsegmente, die der Kreuzungs- und Abseits-Filter der Engine als Querlauf lesen wuerde.
 *
 * @param {{id: string, bezeichnung: string|null, widmung: string, breite: number, punkte: number[][]}[]} achsen
 * @returns {{ids: string[], bezeichnung: string|null, widmung: string, breite: number, punkte: number[][]}[]}
 */
export function verkette(achsen) {
  const gruppen = new Map()
  for (const a of achsen) {
    const key = `${a.bezeichnung ?? ""}|${a.widmung}|${a.breite}`
    if (!gruppen.has(key)) gruppen.set(key, [])
    gruppen.get(key).push(a)
  }
  const zuege = []
  for (const gruppe of gruppen.values()) {
    const anKnoten = new Map()
    gruppe.forEach((a, i) => {
      for (const p of [a.punkte[0], a.punkte[a.punkte.length - 1]]) {
        const k = knoten(p)
        if (!anKnoten.has(k)) anKnoten.set(k, [])
        anKnoten.get(k).push(i)
      }
    })
    const besucht = new Set()
    // Naechste Achse am Knoten: nur wenn dort genau zwei Achsen enden und die andere frei ist.
    const weiter = (k, von) => {
      const hier = anKnoten.get(k) ?? []
      if (hier.length !== 2) return null
      const andere = hier[0] === von ? hier[1] : hier[0]
      return andere === von || besucht.has(andere) ? null : andere
    }
    gruppe.forEach((start, i) => {
      if (besucht.has(i)) return
      besucht.add(i)
      let punkte = [...start.punkte]
      const ids = [start.id]
      for (let aktuell = i, n = weiter(knoten(punkte.at(-1)), i); n != null; n = weiter(knoten(punkte.at(-1)), aktuell)) {
        besucht.add(n)
        const b = gruppe[n].punkte
        const vorwaerts = knoten(b[0]) === knoten(punkte.at(-1))
        punkte = punkte.concat((vorwaerts ? b : [...b].reverse()).slice(1))
        ids.push(gruppe[n].id)
        aktuell = n
      }
      for (let aktuell = i, n = weiter(knoten(punkte[0]), i); n != null; n = weiter(knoten(punkte[0]), aktuell)) {
        besucht.add(n)
        const b = gruppe[n].punkte
        const passtAnsEnde = knoten(b.at(-1)) === knoten(punkte[0])
        punkte = (passtAnsEnde ? b : [...b].reverse()).slice(0, -1).concat(punkte)
        ids.unshift(gruppe[n].id)
        aktuell = n
      }
      zuege.push({ ids, bezeichnung: start.bezeichnung, widmung: start.widmung, breite: start.breite, punkte })
    })
  }
  return zuege
}

const deZahl = (n, stellen = 2) => n.toFixed(stellen).replace(".", ",")

/** Punkt auf halber Laenge des Zugs — nicht der erste Punkt: der liegt am Netzknoten, oft auf der
 *  kreuzenden Strasse, und wuerde den Fund an die falsche Stelle setzen. */
function mitte(punkte) {
  const segs = []
  let gesamt = 0
  for (let i = 1; i < punkte.length; i++) {
    const d = haversineKm({ lng: punkte[i - 1][0], lat: punkte[i - 1][1] }, { lng: punkte[i][0], lat: punkte[i][1] })
    segs.push(d)
    gesamt += d
  }
  let rest = gesamt / 2
  for (let i = 0; i < segs.length; i++) {
    if (rest <= segs[i] || i === segs.length - 1) {
      const t = segs[i] > 0 ? Math.min(1, rest / segs[i]) : 0
      const [a, b] = [punkte[i], punkte[i + 1]]
      return { lng: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]), laengeM: Math.round(gesamt * 1000) }
    }
    rest -= segs[i]
  }
  return { lng: punkte[0][0], lat: punkte[0][1], laengeM: 0 }
}

/** Ein verketteter Zug → normalisiertes Hindernis. */
export function hindernisAusZug(zug, { land, quelleName, quelleUrl }) {
  const { lat, lng, laengeM } = mitte(zug.punkte)
  if (!inDeBbox(lat, lng)) return null
  // Nur eine Nummer, die die Engine lesen kann, geht als strassenRef hinaus. "MSE5" (Kreisstrasse in
  // MV) erkennt normRoadRef nicht; die Engine behandelte es dann wie einen Strassennamen und wuerde
  // den Fund verwerfen, sobald die Route dort einen anderen Namen kennt (zuordnung, Namenszweig).
  const lesbar = zug.bezeichnung && normRoadRef(zug.bezeichnung) ? zug.bezeichnung : null
  const strassenwort = WIDMUNG_WORT[zug.widmung] ?? "Straße"
  const unten = zug.breite - TOLERANZ_UNTEN_M
  const oben = zug.breite + TOLERANZ_OBEN_M
  // Kein "Laenge"/"Hoehe"/"Restbreite"-Wortlaut: makeNormalized zoege daraus Werte, die es nicht gibt.
  const beschreibung =
    `Schmaler Abschnitt laut amtlichem Landschaftsmodell (ATKIS Basis-DLM, ${land}): Fahrbahn ${deZahl(zug.breite, 1)} m ` +
    `auf ${laengeM} m Strecke. Der Wert ist aus dem Luftbild erfasst und auf 0,5 m gerundet, oft nur auf ganze Meter; ` +
    `tatsächlich vermutlich ${deZahl(unten)} bis ${deZahl(oben)} m. Kurze Engstellen wie Verkehrsinseln enthält das ` +
    `Modell nicht — ein Abschnitt ohne diesen Hinweis ist nicht geprüft. Vor Ort prüfen.`
  return makeNormalized({
    externeId: `${zug.bezeichnung ?? zug.widmung}-${zug.breite}#${stabilHash(...[...zug.ids].sort())}`,
    kategorie: "engstelle",
    // Im Titel darf "MSE5" stehen, der Disponent sucht danach; extractStammdaten liest daraus keine Nummer.
    name: `Schmale Fahrbahn ca. ${deZahl(zug.breite, 1)} m — ${lesbar ?? [strassenwort, zug.bezeichnung].filter(Boolean).join(" ")}`,
    beschreibung,
    lat,
    lng,
    strassenRef: lesbar,
    refAusBeschreibung: false,
    geom: { type: "LineString", coordinates: zug.punkte },
    attrs: {
      maxBreiteM: zug.breite,
      breiteToleranzUntenM: TOLERANZ_UNTEN_M,
      breiteToleranzObenM: TOLERANZ_OBEN_M,
    },
    roh: {
      Bezeichnung: zug.bezeichnung,
      Widmung: zug.widmung,
      BreiteDerFahrbahn: zug.breite,
      Achsen: zug.ids.length,
      Objektidentifikatoren: zug.ids.slice(0, 20),
    },
    quelleName,
    quelleUrl,
  })
}
