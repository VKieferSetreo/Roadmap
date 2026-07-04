// Connector Quelle 0157: SEVAS NRW — LKW-/GST-Restriktionskataster (IT.NRW, Servicestelle
// Verkehrsdaten NRW). AMTLICHE Quelle (speist das LKW-Routing von verkehr.nrw). Offenes WFS 2.0,
// GeoJSON ohne Auth. Research-Fund T-563 (2026-06-23). Schließt die NRW-Lücke bei Durchfahrtshöhe/
// Breite/Länge/Achslast (hatten wir bisher NICHT) + tatsächliches Gewicht.
//
// Geometrie ist OSM-linear-referenziert (osm_id/osm_vers), die RESTRIKTIONS-ATTRIBUTE (typ/wert)
// sind amtlich (IT.NRW). Max-Freigabe 2026-06-23: OSM als Geometrie-Referenz ist ok, SOLANGE die
// Daten von der Behörde kommen — hier der Fall. Wir nutzen die echten WGS84-Koordinaten + amtlichen
// Werte; das osm_id-Feld ist nur interne Referenz.
//
// Format-Falle: OUTPUTFORMAT muss EXAKT "application/json; subtype=geojson; charset=utf-8" sein
// (generisches application/json → HTTP 400). Paging via COUNT/STARTINDEX (~17 Seiten à 2000).

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0157"
const QUELLE_NAME = "SEVAS NRW — LKW-/GST-Restriktionen (IT.NRW)"
const QUELLE_URL = "https://sevas.nrw.de/"
const WFS = "https://sevas.nrw.de/osm/sevas"
const TYPENAME = "ms:restriktionen_segmente"
const GEOJSON = "application/json; subtype=geojson; charset=utf-8"
const PAGE = 2000

// StVO-Verkehrszeichen → Kategorie + attrs-Key. wert = Grenzwert (dt. Dezimalkomma).
// Nur Großraum-/Schwertransport-relevante Zeichen; Gefahrgut(261/269)/Krad(260)/Fahrrad(244.1)/… raus.
const VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT" }, // tats. Gewicht
  "263": { kat: "gewicht", key: "maxAchslastT" }, // Achslast
  "264": { kat: "engstelle", key: "maxBreiteM" }, // Breite
  "265": { kat: "bruecke", key: "maxHoeheM" }, // lichte Höhe / Durchfahrtshöhe
  "266": { kat: "engstelle", key: "maxLaengeM" }, // Länge
}
const VZ_LABEL = { "262": "Gewichtsbeschränkung", "263": "Achslastbeschränkung", "264": "Breitenbeschränkung", "265": "Durchfahrtshöhe", "266": "Längenbeschränkung" }

// T-632: KATEGORISCHE Verbote (keine Maß-Zeichen) — bisher als "nicht-SGT" verworfen, dabei sind es
// De-facto-Schwertransport-Restriktionen (~21k VZ-253-Segmente = 61% des Katasters). VZ 253 (Lkw-Verbot
// > 3,5 t) ist ein RECHTLICHES Verbot → gewicht + verkehrsverbotLkwT (Engine wertet als WARNUNG,
// genehmigungsabhängig, NICHT als physische Traglast-Überschreitung). VZ 250/251 (Verbot für Fahrzeuge
// aller Art / Kraftwagen) = echte Durchfahrtssperre → sperrung + vollsperrung (kritisch im Zeitraum).
const VZ_VERBOT = {
  "250": { kat: "sperrung", label: "Durchfahrt verboten (Zeichen 250, Fahrzeuge aller Art)", attrs: { vollsperrung: true } },
  "251": { kat: "sperrung", label: "Verbot für Kraftwagen (Zeichen 251)", attrs: { vollsperrung: true } },
  "253": { kat: "gewicht", label: "Lkw-Durchfahrtsverbot über 3,5 t (Zeichen 253)", attrs: { verkehrsverbotLkwT: 3.5 } },
}

/** "3,6" / "6" → 3.6 / 6 (dt. Komma). Plausibel (>0, <200). */
function wertNum(w) {
  const m = String(w ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : null
  return n && n > 0 && n < 200 ? n : null
}

function firstCoord(geom) {
  let c = geom?.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  const lng = Number(c?.[0]), lat = Number(c?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

// Zusatzzeichen (vz_*=true) = Ausnahmen (Anlieger/Lieferverkehr/landwirtschaftl. Verkehr frei). Für einen
// DURCHFAHRENDEN Großraum-/Schwertransport i.d.R. irrelevant (er ist kein Anlieger) → ändert die Severity
// NICHT, wird aber als Kontext genannt, damit der Disponent den Sonderfall (Ziel als Anlieger) erkennt.
function ausnahmenHinweis(p) {
  const hat = Object.entries(p).some(([k, v]) => k.startsWith("vz_") && v === "true")
  return hat ? " Mit Zusatzzeichen (Ausnahmen möglich, z. B. Anlieger- oder Lieferverkehr frei)." : ""
}
// Zeitfenster (SEVAS zeit1_von/zeit1_bis, HH:MM) → nur als Klartext-Hinweis (kein strukturiertes
// zeitfenster, Tages-Bitmaske hier bewusst nicht interpretiert).
function zeitHinweis(p) {
  const von = String(p.zeit1_von ?? "").trim(), bis = String(p.zeit1_bis ?? "").trim()
  return von && bis ? ` Zeitlich beschränkt (${von}–${bis} Uhr).` : ""
}

/** Ein SEVAS-Feature → normalisiertes Obstacle oder null (nicht relevant). Pure/testbar. */
export function sevasFeatureToObstacle(f) {
  const p = f?.properties ?? {}
  const typ = String(p.typ ?? "")
  const typBase = typ.split("-")[0] // "257-57" → "257"
  const mass = VZ[typ]
  const verbot = VZ_VERBOT[typBase]
  if (!mass && !verbot) return null // nicht-SGT-Zeichen
  const [lng, lat] = firstCoord(f?.geometry)
  if (lat == null) return null
  const strasse = String(p.name ?? "").trim()
  const ort = [p.gemeinde, p.kreis].filter(Boolean).join(", ")
  const geom = f?.geometry && f.geometry.type ? f.geometry : null
  const eid = `nrw-sevas-${p.segment_id}-${p.restrkn_id}`
  const base = { externeId: eid, lat, lng, strassenRef: strasse || null, geom, quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL }

  if (mass) {
    const wert = wertNum(p.wert)
    if (wert == null) return null // Maß-Zeichen ohne Grenzwert → nichts zu prüfen
    const label = VZ_LABEL[typ] || "Beschränkung"
    const labelMitWert = `${label} ${String(wert).replace(".", ",")} ${/T$/.test(mass.key) ? "t" : "m"}`
    return makeNormalized({
      ...base,
      kategorie: mass.kat,
      name: [labelMitWert, strasse].filter(Boolean).join(" · "),
      beschreibung: `${label} (SEVAS NRW, amtliches Restriktionskataster IT.NRW)${ort ? ` · ${ort}` : ""}`,
      attrs: { [mass.key]: wert },
    })
  }
  // Verbot (VZ 250/251/253)
  return makeNormalized({
    ...base,
    kategorie: verbot.kat,
    name: [verbot.label, strasse].filter(Boolean).join(" · "),
    beschreibung: `${verbot.label} (SEVAS NRW, amtliches Restriktionskataster IT.NRW)${ort ? ` · ${ort}` : ""}.${ausnahmenHinweis(p)}${zeitHinweis(p)}`,
    attrs: { ...verbot.attrs },
  })
}

function pageUrl(startIndex) {
  const p = new URLSearchParams({
    SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: TYPENAME,
    OUTPUTFORMAT: GEOJSON, SRSNAME: "EPSG:4326", COUNT: String(PAGE), STARTINDEX: String(startIndex),
  })
  return `${WFS}?${p.toString()}`
}

export const sevasNrwRestriktionenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 4 * * *", // 1× täglich nachts; statisches Restriktionskataster, ändert sich selten
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    let start = 0, total = 0, skipped = 0, pages = 0, complete = true
    // Defensiver Seiten-Backstop: 33.711 / 2000 ≈ 17 → 40 reicht weit, verhindert Endlosschleife.
    for (; pages < 40; pages++) {
      const data = await getJson(pageUrl(start), { timeoutMs })
      // T-627: getJson gibt bei HTTP-/Timeout-/Parse-Fehler NULL zurück (wirft nicht). Das darf NICHT
      // als "letzte Seite" (feats.length < PAGE) durchgehen, sonst signalisiert der Connector einen
      // vollständigen Bestand und der Reconcile deaktiviert die restlichen ~20k echten Zeilen. →
      // Teilbestand signalisieren (complete=false), Reconcile wird übersprungen. Selbstheilung nächster Lauf.
      if (!data) {
        log(`${QUELLE}: Seite bei startIndex=${start} nicht ladbar → Teilbestand (kein Reconcile)`)
        complete = false
        break
      }
      const feats = data.features ?? []
      total += feats.length
      for (const f of feats) {
        const o = sevasFeatureToObstacle(f)
        if (o) obstacles.push(o)
        else skipped++
      }
      if (feats.length < PAGE) break // letzte Seite
      start += PAGE
    }
    log(`${QUELLE}: ${obstacles.length} Restriktionen (Höhe/Gewicht/Breite/Länge/Achslast + Lkw-/Durchfahrtsverbote VZ 250/251/253) aus ${total} Segmenten (${pages + 1} Seiten, ${skipped} übersprungen)`)
    return { obstacles, complete }
  },
}
