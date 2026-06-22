// Connector Quelle 0153: BASt Brückenstatistik Deutschland — schwerverkehrsgesperrte Brücken.
// Research-Fund 2026-06-22 (T-540). Bundesweiter offener ArcGIS-FeatureServer (CC BY 4.0), der
// EINZIGE flächige offene Brücken-Restriktionsquelle über alle Bundesländer (Bundesfernstraßen:
// BAB + Bundesstraßen). Wir ziehen NUR die für den Schwerverkehr gesperrten Teilbauwerke
// (sperrung_sv='ja' = harte GST-Sperrung) — die ~49k unbeschränkten Bauwerke sind reine
// Infrastruktur und gehören NICHT in die Auswertung.
//
// WICHTIG (Welle-2-Korrektur): ASCII-URL ist tot (HTTP 400) → URL-encoded, Layer Brueckenstatistik25.
// f=geojson&outSR=4326 → WGS84 direkt. maxRecordCount=2000 → Paging über resultOffset. 3294 Treffer.
// breite (cm) ist die BAUWERKSbreite (Konstruktion), KEINE Fahrzeug-Breitenrestriktion → NICHT als
// maxBreiteM mappen (wäre Fehlalarm). zn=Zustandsnote (×10), trag_l_idx=Index I-V (keine Tonne).
// Einzige evaluierbare Restriktion = die SV-Sperrung → grundsaetzlicheGstSperre. Beschreibung
// bewusst OHNE m/t-Tokens, damit makeNormalized→extractStammdaten keine Scheinwerte zieht.

import { makeNormalized, getJson, stabilHash } from "./_helpers.js"

const QUELLE = "0153"
const QUELLE_NAME = "BASt Brückenstatistik — schwerverkehrsgesperrte Brücken (bundesweit)"
const BASE = "https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Br%C3%BCckenstatistik_Deutschland/FeatureServer/0"
const LAYER = `${BASE}/query`

function ersteKoordinate(geom) {
  const c = geom?.coordinates
  if (!Array.isArray(c)) return [null, null]
  let cur = c
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  const lng = Number(cur?.[0]), lat = Number(cur?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim()

async function ladeAlle({ pageSize = 2000, maxPages = 50, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const url = `${LAYER}?where=${encodeURIComponent("sperrung_sv='ja'")}` +
      `&outFields=${encodeURIComponent("id_nr,bwnr,tbwnr,bauwerksname,zn,trag_l_idx,ort,kreis,bl")}` +
      `&outSR=4326&f=geojson&resultRecordCount=${pageSize}&resultOffset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data?.features ?? []
    all.push(...feats)
    if (feats.length < pageSize) break
  }
  return all
}

export const bastBrueckenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 4 * * *", // 1× täglich nachts — Brücken-Sperrlisten ändern sich langsam
  vollbestand: true, // wir ziehen den GESAMTEN sperrung_sv='ja'-Bestand → Reconcile räumt aufgehobene Sperrungen

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await ladeAlle({ timeoutMs })
    log(`${QUELLE}: ${feats.length} schwerverkehrsgesperrte Brücken`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersteKoordinate(f.geometry)
      // Beschreibung OHNE m/t-Einheiten (sonst extractStammdaten-Scheinwerte). Zustandsnote (zn)
      // bewusst NICHT ausgegeben — inkonsistent kodiert (mal ×10, mal roh) und ohnehin keine
      // GST-Restriktion. Traglastindex (I–V/GR) trägt keine Einheit → unkritisch.
      const idx = clean(p.trag_l_idx) ? `Traglastindex ${clean(p.trag_l_idx)}` : null
      const ortBl = [clean(p.ort), clean(p.bl)].filter(Boolean).join(", ")
      const beschreibung = ["Für den Schwerverkehr gesperrt (BASt-Brückenstatistik)", idx, ortBl]
        .filter(Boolean).join(". ") || null
      // Stabile externeId: Bauwerks- + Teilbauwerksnummer (ändern sich nicht) + Geo-Hash als Diskriminator.
      const externeId = `${clean(p.bwnr) || "x"}-${clean(p.tbwnr) || "0"}#${stabilHash(lat, lng, p.id_nr)}`
      return makeNormalized({
        externeId,
        kategorie: "bruecke",
        name: clean(p.bauwerksname) || `Brücke ${clean(p.bwnr)}`,
        beschreibung,
        lat, lng,
        attrs: { grundsaetzlicheGstSperre: true }, // sperrung_sv='ja' = harte GST-Sperrung
        quelleName: QUELLE_NAME, quelleUrl: "https://www.bast.de",
      })
    })

    const ids = new Set(obstacles.map((o) => o.externeId))
    if (ids.size !== obstacles.length) {
      log(`${QUELLE}: WARN externeId-Kollision — ${obstacles.length} Features, ${ids.size} distinct`)
    }
    return { obstacles }
  },
}
