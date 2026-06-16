// Connector Quelle 0303: GST-WSV — Straßen-/Wegebrückenanlagen über Bundeswasserstraßen
// (Wasserstraßen- und Schifffahrtsverwaltung des Bundes, via.bund.de/wsv/gst). Bundesweite
// Brücken-Kreuzungsbauwerke über Bundeswasserstraßen — als Punkt-Hindernisse (Standort +
// Zuständigkeit für GST/VEMAGS). WFS 2.0 liefert NUR GML 3.2 (kein GeoJSON) → dependency-freier
// GML-Parser wie 0125. SRSNAME=EPSG:4326 → <gml:pos> = "lat lon".
//
// FURTHERINFO ist i.d.R. nur "www.wsv.de" (keine Maße); wir parsen es + BENENNUNG dennoch
// defensiv auf Höhe/Last — falls einzelne Datensätze Werte tragen, landen sie in attrs und
// erzeugen einen Fund. Ohne Werte = reines Standort-/Zuständigkeits-Inventar auf Karte/DB.
// Lizenz: kostenlos, keine NC, Namensnennung „© Wasserstraßen- und Schifffahrtsverwaltung
// des Bundes (www.wsv.de)".

import { makeNormalized, getText, stabilHash, meterAusText, tonnageAusText } from "./_helpers.js"

const QUELLE = "0303"
const QUELLE_NAME = "GST-WSV — Brückenanlagen über Bundeswasserstraßen (WSV)"
const QUELLE_URL = "https://via.bund.de/wsv/gst/"
const WFS = "https://via.bund.de/wsv/gst/wfs"
const TYPENAME = "ms:strassen_und_wegebrueckenanlagen"
const PAGE = 2000
const MAX_PAGES = 25 // Sicherheits-Obergrenze; Abbruch sobald eine Seite < PAGE liefert (Vollbestand)

function tag(s, name) {
  const m = s.match(new RegExp(`<ms:${name}>([\\s\\S]*?)</ms:${name}>`))
  return m ? m[1].trim() || null : null
}
function dec(s) {
  return s == null ? null : s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || null
}

async function ladeAlle({ timeoutMs = 60000 } = {}) {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${TYPENAME}` +
      `&SRSNAME=urn:ogc:def:crs:EPSG::4326&COUNT=${PAGE}&STARTINDEX=${page * PAGE}`
    const xml = await getText(url, { timeoutMs })
    const members = (xml ?? "").match(/<ms:strassen_und_wegebrueckenanlagen\b[\s\S]*?<\/ms:strassen_und_wegebrueckenanlagen>/g) ?? []
    all.push(...members)
    if (members.length < PAGE) break
  }
  return all
}

export const gstWsvKreuzungsbauwerkeConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const members = await ladeAlle({ timeoutMs })
    const obstacles = []
    let verworfen = 0
    for (const m of members) {
      const pos = m.match(/<gml:pos>([^<]+)<\/gml:pos>/)?.[1]
      const [lat, lng] = pos ? pos.trim().split(/\s+/).map(Number) : [null, null]
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { verworfen++; continue }
      const uuid = tag(m, "UUID") || m.match(/gml:id="([^"]+)"/)?.[1]
      const benennung = dec(tag(m, "BENENNUNG"))
      const furtherInfo = dec(tag(m, "FURTHERINFO"))
      const verantwortlicher = dec(tag(m, "VERANTWORTLICHER"))
      const bundesland = dec(tag(m, "BUNDESLAND"))
      // Defensive Maß-Extraktion (meist leer → attrs bleibt {})
      const freitext = [benennung, furtherInfo].filter(Boolean).join(" ")
      const maxHoeheM = meterAusText(freitext, /(?:höhe|hoehe|durchfahrt|lichte)/i)
      const maxGewichtT = tonnageAusText(freitext)
      const attrs = {}
      if (maxHoeheM != null) attrs.maxHoeheM = maxHoeheM
      if (maxGewichtT != null) attrs.maxGewichtT = maxGewichtT
      obstacles.push(makeNormalized({
        externeId: uuid || `wsv#${stabilHash(lat, lng, benennung)}`,
        kategorie: "bruecke",
        name: benennung || "Brückenanlage über Bundeswasserstraße",
        beschreibung: [verantwortlicher, bundesland].filter(Boolean).join(" · ") || null,
        lat, lng,
        strassenRef: null,
        attrs,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      }))
    }
    log(`${QUELLE}: ${members.length} geladen · ${obstacles.length} Brückenanlagen · ${verworfen} ohne Koords`)
    return { obstacles }
  },
}
