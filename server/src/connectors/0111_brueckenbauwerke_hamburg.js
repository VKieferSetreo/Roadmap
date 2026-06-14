// Connector Quelle 0111: Brücken & Ingenieurbauwerke Hamburg (LSBG).
// Port aus API/Länder/Hamburg/WFS-Brueckenbauwerke-Hamburg-LSBG/brueckenbauwerke-hamburg.cron.mjs.
// Straßenbrücken, Tunnel, Verkehrszeichenbrücken. deegree geo+json unzuverlässig → GML-Parsing
// (WFS 1.1.0, je FeatureType ein Request). Punkt in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(e,n,32).

import { makeNormalized, getText, utmZuWgs84, num, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "Brücken & Ingenieurbauwerke Hamburg (LSBG)"
const QUELLE_URL = "https://metaver.de/trefferanzeige?docuuid=7534E0B7-F558-4F78-8417-32B24B011C48"
const BASE = "https://geodienste.hamburg.de/HH_WFS_Brueckenbauwerke"
// ALLE realen Ingenieurbauwerk-Layer ziehen (GetCapabilities bietet 11 FeatureTypes). Früher waren
// nur 3 hardcoded → >1.200 Bauwerke (Fußgänger-/Stütz-/Lärmschutz-/sonstige + in-Planung) wurden
// stillschweigend gedroppt. Alle Layer haben dieselbe Struktur (anzid + gml:Point + gis_utm_*).
// Negativliste statt Positivliste: neu hinzukommende Quell-Layer gehen so nicht still verloren —
// bewusst NICHT gewünscht sind nur die Overview-/Admin-Layer (fhh, fhh_polygone) und abgerissene
// Bauwerke (ehemalige_bauwerke, keine realen Hindernisse mehr).
const AUSGESCHLOSSEN = new Set(["de.hh.up:fhh", "de.hh.up:fhh_polygone", "de.hh.up:ehemalige_bauwerke"])
const TYPEN = [
  { ft: "de.hh.up:strassenbruecken", kat: "bruecke" },
  { ft: "de.hh.up:fussgaengerbruecken", kat: "bruecke" },
  { ft: "de.hh.up:tunnel", kat: "tunnel" },
  { ft: "de.hh.up:verkehrszeichenbruecken", kat: "ampel" }, // Schilderbrücke = Höhenrestriktion
  { ft: "de.hh.up:stuetzbauwerke", kat: "sonstige" }, // Stützmauern
  { ft: "de.hh.up:laermschutzbauwerke", kat: "sonstige" },
  { ft: "de.hh.up:sonstige_bauwerke", kat: "sonstige" },
  { ft: "de.hh.up:bauwerke_in_planung", kat: "bruecke" }, // zukünftige Maßnahmen (Nutzer-Vorgabe: auch zukünftige)
].filter((t) => !AUSGESCHLOSSEN.has(t.ft))

// Hoher Sicherheits-Cap (größter Layer ~941); GML-Request ohne Paging → maxFeatures muss alles fassen.
const MAX_FEATURES = 50000

function parseGml(xml, ft) {
  if (!xml) return []
  const local = ft.split(":")[1]
  const out = []
  const re = new RegExp(`<de\\.hh\\.up:${local}\\b[^>]*>([\\s\\S]*?)</de\\.hh\\.up:${local}>`, "g")
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const props = {}
    const pre = new RegExp(`<de\\.hh\\.up:([a-z_0-9]+)>([^<]*)</de\\.hh\\.up:\\1>`, "g")
    let pm
    while ((pm = pre.exec(block)) !== null) props[pm[1]] = pm[2].trim()
    // Koordinaten retten — KEIN Eintrag wegen fehlender Koords verlieren, solange irgendwie rekonstruierbar:
    //  1) gml:pos (Punkt), 2) gml:posList (Linie/Fläche → erstes Koordinatenpaar = Repräsentativpunkt),
    //  3) gis_utm_rechts/gis_utm_hoch als reine Property-Felder (in JEDEM Feature vorhanden, robuster Fallback).
    let e = null, n = null
    const pos = block.match(/<gml:pos\b[^>]*>\s*(-?[\d.]+)\s+(-?[\d.]+)/)
    if (pos) { e = Number(pos[1]); n = Number(pos[2]) }
    if (e == null || n == null || !Number.isFinite(e) || !Number.isFinite(n)) {
      const posList = block.match(/<gml:posList\b[^>]*>\s*(-?[\d.]+)\s+(-?[\d.]+)/)
      if (posList) { e = Number(posList[1]); n = Number(posList[2]) }
    }
    if (e == null || n == null || !Number.isFinite(e) || !Number.isFinite(n)) {
      const r = num(props.gis_utm_rechts), h = num(props.gis_utm_hoch)
      if (r != null && h != null) { e = r; n = h }
    }
    out.push({ props, e, n })
  }
  return out
}
function refAus(name) {
  const m = String(name ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  return m ? `${m[1]}${m[2]}` : null
}

export const brueckenbauwerkeHamburgConnector = {
  quelleId: "0111",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    for (const { ft, kat } of TYPEN) {
      const url =
        `${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${ft}` +
        `&maxFeatures=${MAX_FEATURES}&OUTPUTFORMAT=text/xml;%20subtype=gml/3.1.1`
      const xml = await getText(url, { timeoutMs })
      const feats = parseGml(xml, ft)
      log(`${ft}: ${feats.length} Bauwerke`)
      if (feats.length >= MAX_FEATURES) log(`${ft}: maxFeatures-Cap (${MAX_FEATURES}) erreicht — Bestand evtl. abgeschnitten`)
      for (const { props, e, n } of feats) {
        const [lng, lat] = e != null && n != null ? utmZuWgs84(e, n, 32) : [null, null]
        // externeId: EINDEUTIG je Einzel-Bauwerk UND STABIL über Läufe (reconcile-stabil).
        // Quell-IDs (anzid/idnr/bauwerksnummer) sind nicht garantiert eindeutig (Teilbauwerke teilen
        // eine bauwerksnummer; anzid/idnr können null sein) → sonst überschreiben sich Datensätze beim
        // Upsert auf (quelle, externe_id). stabilHash über unterscheidende Quellfelder (Koords + FT +
        // Teilbauwerks-/interne Nummer + Name + Art) macht zwei Bauwerke am selben Ort unterscheidbar.
        // Kein Array-Index/Zufall (nicht reconcile-stabil): gleiche Quelle → gleicher Hash.
        const quellId = props.anzid ?? props.idnr ?? props.bauwerksnummer ?? props.internebauwerksnummer ?? "x"
        const externeId = `${quellId}#${stabilHash(
          ft, e, n,
          props.bauwerksnummer, props.teilbauwerksnummer, props.internebauwerksnummer,
          props.bauwerksname, props.bauwerksart,
        )}`
        obstacles.push(makeNormalized({
          externeId,
          kategorie: kat,
          name: (props.bauwerksname || `${kat} ${props.bauwerksnummer ?? ""}`).trim(),
          beschreibung: (props.bauwerksart || "").trim() || null,
          lat, lng,
          strassenRef: refAus(props.bauwerksname),
          attrs: { baujahr: num(props.baujahr) ?? undefined },
          quelleName: QUELLE_NAME,
          quelleUrl: QUELLE_URL,
        }))
      }
    }
    return { obstacles }
  },
}
