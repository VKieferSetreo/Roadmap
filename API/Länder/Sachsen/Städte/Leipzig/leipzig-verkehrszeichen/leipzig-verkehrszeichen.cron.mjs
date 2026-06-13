#!/usr/bin/env node
// Cron-Job: Leipzig — Verkehrszeichen-Kataster (geodienste.leipzig.de) — Quellen-ID 0221.
// Zieht das GESAMTE VZ-Kataster (WFS 2.0 GeoJSON, Punkt, ~82.534 Features, EPSG:25833) und filtert
// auf die GST-relevanten Beschränkungszeichen: VZ 262 (zul. Gesamtmasse t), 263 (Achslast t),
// 264 (Breite m), 265 (Höhe m), 266 (Länge m). Reprojiziert UTM33 → WGS84 (ZONE 33!), mappt in
// unser obstacle-Format v1.0 (befristung=dauerhaft — Schilder sind dauerhafte Restriktionen) und
// schreibt zur VERIFIKATION leipzig-verkehrszeichen.normalisiert.json. KEINE DB, NICHT die Engine.
// Lauf:  node leipzig-verkehrszeichen.cron.mjs
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, getJson, schreibeErgebnis, utmZuWgs84, tonnageAusText, meterAusText,
} from "../../../../../_lib/format.mjs"

const QUELLE = "0221"
const QUELLE_NAME = "Leipzig — Verkehrszeichen-Kataster (GST-Beschränkungen)"
const PORTAL = "https://opendata.leipzig.de/dataset/verkehrszeichen-stadt-leipzig"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// VZ-Nr → unsere Kategorie + attrs-Key + Zone-Parser. Werte stecken im Zusatztext (vz_zus_tx /
// so_av_tx / vz_bez). VZ 264/265/266 sind Meter, 262/263 Tonnen.
const GST_VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT", einheit: "t" },
  "263": { kat: "gewicht", key: "maxAchslastT", einheit: "t" },
  "264": { kat: "engstelle", key: "maxBreiteM", einheit: "m" },
  "265": { kat: "bruecke", key: "maxHoeheM", einheit: "m" }, // Höhe meist Brücke/Unterführung
  "266": { kat: "engstelle", key: "maxLaengeM", einheit: "m" },
}

// WFS 2.0 GeoServer, Layer "verkehrszeichen" (klein). EPSG:25833 (Zone 33!). GeoServer-CQL-Filter
// (cql_filter) auf vz_nr IN (...) zieht serverseitig nur die GST-relevanten Schilder → klein + schnell.
const VZ_LISTE = Object.keys(GST_VZ).map((n) => `'${n}'`).join(",")
const BASE =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:verkehrszeichen&outputFormat=application/json" +
  `&cql_filter=${encodeURIComponent(`vz_nr IN (${VZ_LISTE})`)}`

let feats = []
let gesamtBestand = null
try {
  const data = await getJson(`${BASE}&count=5000`, { timeoutMs: 90000 })
  feats = data.features ?? []
  gesamtBestand = data.totalFeatures ?? data.numberMatched ?? feats.length
} catch (e) {
  // Fallback ohne CQL: erste 5.000 ziehen und clientseitig filtern (Verifikations-Cap; voller
  // Bestand ~82.534 → für DB-Import alle Seiten via startIndex paginieren).
  console.warn(`WARN cql_filter fehlgeschlagen (${e.message}) → Fallback ohne Filter`)
  const data = await getJson(
    "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
    "&typeName=OpenData:verkehrszeichen&outputFormat=application/json&count=5000", { timeoutMs: 90000 })
  feats = (data.features ?? []).filter((f) => GST_VZ[String(f.properties?.vz_nr ?? "")])
  gesamtBestand = data.totalFeatures ?? feats.length
}

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  const vz = GST_VZ[String(p.vz_nr ?? "")]
  if (!vz) return null
  const [lng, lat] = ersterPunktUtm33(f.geometry)
  const text = [p.vz_zus_tx, p.so_av_tx, p.vz_bez].filter(Boolean).join(" ")
  const wert = vz.einheit === "t" ? tonnageAusText(text) : meterAusText(text, null)
  return makeObstacle({
    quellenId: QUELLE, externeId: p.so_id ?? p.objectid ?? f.id,
    kategorie: vz.kat, befristung: "dauerhaft",
    name: `${p.vz_bez ?? `VZ ${p.vz_nr}`} — ${p.so_seg_sn ?? p.vz_seg_sn ?? ""}`.trim(),
    beschreibung: text.trim() || null,
    lat, lng,
    strassenRef: null,
    attrs: cleanAttrs({
      [vz.key]: wert,
      vzNr: p.vz_nr ?? undefined,
      vzBez: p.vz_bez ?? undefined,
      richtung: p.vz_rtg_tx ?? undefined,
      strasse: p.so_seg_sn ?? p.vz_seg_sn ?? undefined,
    }),
    realerStart: dateOnlySafe(p.so_beg ?? p.vz_aufst),
    gueltigVon: dateOnlySafe(p.so_beg ?? p.vz_aufst),
    gueltigBis: dateOnlySafe(p.so_end),
    quelleName: QUELLE_NAME, quelleUrl: PORTAL, roh: p, abgerufenAm: now,
  })
}).filter(Boolean)

function ersterPunktUtm33(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 33)
}
function dateOnlySafe(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "leipzig-verkehrszeichen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: gesamtBestand, obstacles,
})
console.log(`=== VERIFIKATION Leipzig Verkehrszeichen (GST-Beschränkungen) ===`)
console.log(`Kataster gesamt: ~82.534 · GST-relevant gezogen: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng: ${obstacles.filter((o) => o.lat != null).length}`)
console.log(`Kategorien:`, obstacles.reduce((a, o) => ((a[o.kategorie] = (a[o.kategorie] ?? 0) + 1), a), {}))
console.log(`mit Grenzwert (irgendein attrs.max*):`, obstacles.filter((o) =>
  o.attrs.maxGewichtT != null || o.attrs.maxAchslastT != null || o.attrs.maxBreiteM != null ||
  o.attrs.maxHoeheM != null || o.attrs.maxLaengeM != null).length)
const m = obstacles.find((o) => o.lat != null)
if (m) console.log(`Plausi lat/lng (sollte ~Leipzig 51.34/12.37 sein): ${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
