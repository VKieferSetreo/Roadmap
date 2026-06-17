// Connector Quelle 0112: Baustellen Hamburg (stadtweit, BVM/LGV).
// Port aus API/Länder/Hamburg/WFS-Baustellen-Hamburg/baustellen-hamburg.cron.mjs.
// deegree-WFS liefert geo+json unzuverlässig → GML-Parsing (WFS 1.1.0, maxFeatures). Punkt-
// Geometrie in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(e,n,32). Datumsfelder DD.MM.YYYY.

import { makeNormalized, getText, utmZuWgs84, dateOnly, meterAusText, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "Baustellen Hamburg (stadtweit, BVM/LGV)"
const QUELLE_URL = "https://suche.transparenz.hamburg.de/dataset/baustellen-hamburg"
const BASE = "https://geodienste.hamburg.de/hh_wfs_baustellen" // lowercase host wichtig
const PAGE_SIZE = 2000 // pro WFS-1.1.0-Request (maxFeatures); paginiert via startIndex bis erschöpft
const MAX_PAGES = 500 // hoher Sicherheits-Backstop — NICHT zum Abschneiden, nur Endlosschutz
// Eine WFS-1.1.0-GetFeature-Seite: maxFeatures + startIndex (deegree-kompatibel). KEIN harter
// 5000er-Cap mehr — die fetch()-Schleife zieht bis numberOfFeatures < pageSize.
function pageUrl(startIndex) {
  return (
    `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=de.hh.up:baustelle` +
    `&maxFeatures=${PAGE_SIZE}&startIndex=${startIndex}` +
    `&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
  )
}

// Koordinate (E,N) aus EINEM Geometrie-Block ziehen — Punkt, Linie, Fläche, Multi-*. WICHTIG:
// Baustellen sind oft Linien/Flächen → Koordinaten stehen in <gml:posList> (oder bbox-Ecken),
// NICHT in <gml:pos>. Ohne diesen Fallback würde jede nicht-punktförmige Baustelle e=n=null
// bekommen und mangels lat/lng verworfen (drop_no_coords). Reihenfolge: pos → posList →
// coordinates → bbox-Mittelpunkt (lowerCorner/upperCorner). Erstes erfolgreiches Paar gewinnt.
function koordAus(block) {
  // 1) Einzelpunkt: <gml:pos>E N</gml:pos>
  const pos = block.match(/<gml:pos\b[^>]*>\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)/)
  if (pos) return [Number(pos[1]), Number(pos[2])]
  // 2) Linie/Fläche: <gml:posList>E1 N1 E2 N2 …</gml:posList> → erstes Paar (Repräsentant).
  const posList = block.match(/<gml:posList\b[^>]*>\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)/)
  if (posList) return [Number(posList[1]), Number(posList[2])]
  // 3) GML 2 / Altform: <gml:coordinates>E,N …</gml:coordinates>
  const coords = block.match(/<gml:coordinates\b[^>]*>\s*([\d.eE+\-]+)\s*,\s*([\d.eE+\-]+)/)
  if (coords) return [Number(coords[1]), Number(coords[2])]
  // 4) Bounding-Box-Mittelpunkt: <gml:lowerCorner>E N</…> + <gml:upperCorner>E N</…>
  const lower = block.match(/<gml:lowerCorner\b[^>]*>\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)/)
  const upper = block.match(/<gml:upperCorner\b[^>]*>\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)/)
  if (lower && upper) return [(Number(lower[1]) + Number(upper[1])) / 2, (Number(lower[2]) + Number(upper[2])) / 2]
  return [null, null]
}

// Minimaler GML-Parser: featureMember-Blöcke → Felder + Koordinate (Punkt/Linie/Fläche/Multi/bbox).
function parseGml(xml, local, ns) {
  if (!xml) return []
  const out = []
  const re = new RegExp(`<${ns}:${local}\\b[^>]*gml:id="([^"]*)"[^>]*>([\\s\\S]*?)</${ns}:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const gmlId = m[1], block = m[2]
    const props = {}
    const pre = new RegExp(`<${ns}:([a-z_0-9]+)>([^<]*)</${ns}:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) if (!(pm[1] in props)) props[pm[1]] = pm[2].trim()
    const [e, n] = koordAus(block)
    out.push({ gmlId, props, e: Number.isFinite(e) ? e : null, n: Number.isFinite(n) ? n : null })
  }
  return out
}

// numberOfFeatures-Attribut der WFS-1.1.0-FeatureCollection (Abschneide-Indikator / Vollständigkeit).
function numberOfFeatures(xml) {
  const m = xml && xml.match(/numberOfFeatures="(\d+)"/)
  return m ? Number(m[1]) : null
}

export const baustellenHamburgConnector = {
  quelleId: "0112",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    // Voll-Abruf via startIndex-Pagination (WFS 1.1.0, maxFeatures+startIndex). KEIN fixer Cap mehr:
    // läuft bis eine Seite < PAGE_SIZE liefert (Bestand erschöpft) — sonst würde Reconcile (vollbestand)
    // alle ab dem alten 5000er-Cap abgeschnittenen Baustellen zusätzlich deaktivieren.
    const feats = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const xml = await getText(pageUrl(page * PAGE_SIZE), { timeoutMs })
      const seite = parseGml(xml, "baustelle", "de.hh.up")
      feats.push(...seite)
      const total = numberOfFeatures(xml)
      // Letzte Seite: weniger als angefordert (oder leer) → Bestand vollständig.
      if (seite.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) {
        log(`Baustellen Hamburg: Sicherheits-Cap MAX_PAGES=${MAX_PAGES} erreicht bei ${feats.length}${total != null ? `/${total}` : ""} — Bestand evtl. abgeschnitten`)
      }
    }
    log(`Baustellen Hamburg: ${feats.length} Features`)
    const obstacles = []
    for (const { gmlId, props: p, e, n } of feats) {
      const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
      const text = [p.umfang, p.anlass].filter(Boolean).join(" — ")
      // externeId: eindeutig pro Einzel-Eintrag UND reconcile-stabil (deterministisch über Läufe).
      // gmlId ist die native WFS-Feature-ID (stabil); zur Härtung gegen null/Dublette ein Diskriminator
      // aus unterscheidenden Quellfeldern (Ort + Titel + Anlass/Umfang + von/bis-Datum). So kollabieren
      // zwei Meldungen am selben Ort (Fahrtrichtung/Teilstück/Phase) NICHT. KEIN Array-Index/Zufall.
      const externeId = `${gmlId ?? "x"}#${stabilHash(lat, lng, p.titel, p.anlass, p.umfang, p.baubeginn, p.bauende)}`
      obstacles.push(makeNormalized({
        externeId,
        kategorie: "baustelle",
        name: p.titel || "Baustelle Hamburg",
        beschreibung: text || null,
        lat, lng,
        attrs: {
          restbreiteM: meterAusText(p.umfang, /breite/i) ?? undefined,
          // iststoerung = bloßes Störungs-Flag, KEINE Vollsperrung (überflaggte jede Baustelle).
          // Echte Sperrung nur, wenn der Umfang-Text sie nennt.
          vollsperrung: /vollsperr|voll gesperrt/i.test(p.umfang ?? "") ? true : undefined,
        },
        realerStart: dateOnly(p.baubeginn),
        gueltigVon: dateOnly(p.baubeginn),
        gueltigBis: dateOnly(p.bauende),
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
