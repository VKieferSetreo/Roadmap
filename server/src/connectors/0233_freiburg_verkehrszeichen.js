// Connector Quelle 0233: Freiburg im Breisgau — Verkehrszeichen-Kataster (GST-Beschränkungen).
//
// WARUM DIESE QUELLE: Baden-Württemberg ist im Bestand die grösste Fläche mit der duennsten
// Datenlage — 2.344 Eintraege, davon GENAU EINER mit einer Gewichtsangabe (gemessen 06.09.2026).
// Das Land selbst liefert nichts Besseres: die Grossraum- und Schwerlaststreckenkarte BW gibt es
// weiterhin nur als PDF mit Datenstand 2017 und ohne Geometrie (T-552, blocked-extern, hier am
// 06.09.2026 erneut geprueft). Der landesweite Verkehrszeichen-Gesamtexport von MobiData BW
// (163.504 Schilder, signs.geojson) enthaelt in seinen 52 Zeichenarten KEIN einziges 262/263/264/
// 265/266 — nur Tempo, Vorfahrt, Ortstafeln. Die Bruecken BW (9.825 Punkte) tragen laut
// Felderbeschreibung weder lichte Hoehe noch Tragfaehigkeit.
// Das Freiburger Kataster ist damit die einzige in BW maschinell abrufbare Quelle, die
// Durchfahrtshoehen und Tonnagen als strukturierte Werte fuehrt.
//
// TECHNIK: MapServer-WFS 2.0, GeoJSON, EPSG:25832 (UTM Zone 32N) → utmZuWgs84 ueber ersterPunkt.
// Ein serverseitiger OGC-FILTER (PropertyIsLike auf stvo_nr) zieht nur die fuenf GST-relevanten
// Beschraenkungszeichen (371 Treffer) statt des 48.583er Vollbestands.
//
// LIZENZ: Datenlizenz Deutschland Namensnennung 2.0 (dl-de/by-2.0) — kommerzielle Nutzung
// erlaubt, Namensnennung „Freiburg i. Br. - Geodatenmanagement". WFS-Capabilities: Fees
// „no conditions apply", AccessConstraints „none".
//
// DATENSTAND: Die Schilder wurden KI-gestuetzt aus den Befahrungsdaten Fruehjahr 2024 abgeleitet
// (Recall 0,99 / Precision 0,98 laut Anbieter). Temporaere Baustellenbeschilderung ist NICHT
// enthalten — das ist hier ein Vorteil: Schilder aus diesem Kataster sind DAUERHAFTE Restriktionen.
// Deshalb bleiben gueltigVon/gueltigBis leer (dauerhaft aktiv); p.datum ist der Befahrungstag,
// also Quell-Aktualitaet und kein Gueltigkeitsbeginn — als gueltigVon waere es schlicht falsch.

import { makeNormalized, fetchAllFeatures, ersterPunkt, stabilHash } from "./_helpers.js"

const QUELLE = "0233"
const QUELLE_NAME = "Freiburg im Breisgau — Verkehrszeichen-Kataster (GST-Beschränkungen)"
const QUELLE_URL = "https://mobidata-bw.de/dataset/vz-freiburg"
const WFS = "https://geoportal.freiburg.de/wfs/digit_verkehrszeichen/digit_verkehrszeichen"
const TYPENAME = "ms:verkehrszeichen_2024"
const ORT = "Freiburg im Breisgau"

// VZ-Nr → Kategorie, attrs-Key, Titel-Wort, Einheit und Plausibilitaetsgrenze. Zuschnitt und
// Achslast-Trennung wie bei 0155/0221: Z263 ist die ACHSLAST und darf NICHT als Gesamtgewicht
// gewertet werden (sonst blockt ein Achslast-Schild jeden schweren Transport, T-611).
const GST_VZ = {
  262: { kat: "gewicht", key: "maxGewichtT", wort: "Gewichtsbeschränkung", einheit: "t", max: 60 },
  263: { kat: "gewicht", key: "maxAchslastT", wort: "Achslastbeschränkung", einheit: "t", max: 30 },
  264: { kat: "engstelle", key: "maxBreiteM", wort: "Breitenbeschränkung", einheit: "m", max: 10 },
  265: { kat: "bruecke", key: "maxHoeheM", wort: "Durchfahrtshöhe", einheit: "m", max: 10 },
  266: { kat: "engstelle", key: "maxLaengeM", wort: "Längenbeschränkung", einheit: "m", max: 60 },
}

const FILTER =
  `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:Or>` +
  Object.keys(GST_VZ)
    .map(
      (c) =>
        `<fes:PropertyIsLike wildCard="*" singleChar="." escapeChar="!">` +
        `<fes:ValueReference>stvo_nr</fes:ValueReference><fes:Literal>${c}*</fes:Literal>` +
        `</fes:PropertyIsLike>`,
    )
    .join("") +
  `</fes:Or></fes:Filter>`
const BASE =
  `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeNames=${encodeURIComponent(TYPENAME)}` +
  `&outputFormat=geojson&FILTER=${encodeURIComponent(FILTER)}`

/** Der Beschraenkungswert steht im OCR-Feld `text` („3,8 m", „7,5 t", „2,0m"), NICHT im Suffix der
 *  Zeichennummer. Das Suffix ist die Katalog-Variante und stimmt nicht durchgehend mit dem Schild
 *  ueberein: alle 18 Laengenzeichen heissen „266-10", tragen aber 8, 10, 12 und 18 m; „263-8" traegt
 *  13 t, „262-3.3" traegt 3,5 t (15 von 371 Abweichungen, gemessen 06.09.2026). Wer das Suffix als
 *  Wert liest, erfindet fuer diese Schilder eine falsche Grenze. Darum ausschliesslich `text`, und
 *  wenn dort keine Zahl steht (1 von 371: OCR las nur „m"), bleibt der Wert leer statt geraten. */
function wertAusAufschrift(text, max) {
  const m = String(text ?? "").match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  // Obergrenze je Zeichenart faengt einen OCR-Ausreisser ab (z.B. „38 m" statt „3,8 m"), der als
  // Grenzwert sonst eine reale Beschraenkung unsichtbar machen wuerde.
  return Number.isFinite(n) && n > 0 && n <= max ? n : null
}

export const freiburgVerkehrszeichenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 5 * * 3", // Kataster aus einer einmaligen Befahrung → woechentlich reicht
  // Der Server-Filter zieht den VOLLSTAENDIGEN Bestand der fuenf Zeichenarten (371 < Seitengroesse),
  // paginiert bis numberMatched → Reconcile darf abgeraeumte Schilder deaktivieren.
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 20, timeoutMs, log })
    // Ein leerer Bestand ist hier kein gueltiges Ergebnis: das Kataster ist statisch. Kaeme 0 durch,
    // wuerde der Vollbestand-Reconcile alle Freiburger Beschraenkungen deaktivieren („Strecke frei").
    if (!feats || feats.length === 0) {
      throw new Error(`${QUELLE}: WFS lieferte 0 Beschraenkungszeichen — Bestand unveraendert gelassen`)
    }

    const obstacles = []
    let verworfen = 0
    for (const f of feats) {
      const p = f?.properties ?? {}
      const nr = String(p.stvo_nr ?? "")
      const vz = GST_VZ[nr.slice(0, 3)]
      // Der PropertyIsLike-Filter matcht auf Praefix; ein „2650" o.ae. gibt es im Katalog nicht,
      // die Gegenpruefung kostet nichts und haelt fremde Zeichen sicher draussen.
      if (!vz) {
        verworfen++
        continue
      }
      // Quelle liefert UTM32; ersterPunkt reprojiziert Koordinaten > 1000 mit Zone 32 nach WGS84.
      const [lng, lat] = ersterPunkt(f.geometry, 32)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        verworfen++
        continue
      }
      const aufschrift = String(p.text ?? "").trim()
      const wert = wertAusAufschrift(aufschrift, vz.max)
      const anzeige = wert != null ? `${vz.wort} ${String(wert).replace(".", ",")} ${vz.einheit}` : vz.wort
      obstacles.push(
        makeNormalized({
          // p.id ist die Objekt-ID des Katasters und ueber den Abzug eindeutig (371/371, gemessen
          // 06.09.2026). Zeichennummer und Geometrie-Hash haengen dran, damit zwei Schilder an
          // einem Mast (Hoehe + Gewicht) sich beim Upsert auf (quelle, externe_id) nicht
          // gegenseitig ueberschreiben und der Schluessel ueber Laeufe stabil bleibt.
          externeId: `${p.id ?? f.id ?? "vz"}-${nr}#${stabilHash(lat, lng, nr)}`,
          kategorie: vz.kat,
          name: `${anzeige} — ${ORT}`,
          beschreibung: aufschrift || null,
          lat,
          lng,
          strassenRef: null,
          refAusBeschreibung: false, // reine Stadt-Quelle (T-618): keine Ref aus dem Freitext ziehen
          attrs: {
            [vz.key]: wert ?? undefined,
            // Bei Z264 zusaetzlich restbreiteM setzen: sonst zieht die Freitext-Extraktion in
            // makeNormalized den Wert selbst aus „Breitenbeschränkung 2 m" und setzt faelschlich
            // das kiAufbereitet-Flag, obwohl der Wert strukturiert aus der Quelle kommt (wie 0134).
            ...(vz.key === "maxBreiteM" && wert != null ? { restbreiteM: wert } : {}),
          },
          // Kein gueltigVon/gueltigBis: aufgestellte Schilder gelten dauerhaft, p.datum ist der
          // Befahrungstag (Quell-Aktualitaet), kein Gueltigkeitsbeginn.
          // ost/nord/hoehe/hoehe_ueber_boden/azimut bewusst NICHT durchreichen: `hoehe` ist die
          // Gelaendehoehe ueber NN (z.B. 207,9) und `hoehe_ueber_boden` die Montagehoehe des
          // Schildes — beides wuerde in der Anreicherung als Durchfahrtshoehe missverstanden.
          roh: {
            id: p.id,
            stvo_nr: p.stvo_nr,
            text: p.text,
            datum: p.datum,
            url_infra3d: p.url_infra3d,
            img: p.img,
          },
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }),
      )
    }
    log(`${QUELLE}: ${feats.length} Schilder geladen · ${obstacles.length} Beschraenkungen · ${verworfen} verworfen`)
    return { obstacles }
  },
}
