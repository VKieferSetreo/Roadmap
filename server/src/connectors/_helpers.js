// Geteilte Connector-Helfer (dependency-frei) — Port aus API/_lib/format.mjs.
// Connectoren ziehen den vollen Quell-Bestand und mappen via makeNormalized() in den
// Importer-Vertrag (NormalizedObstacle). Koordinaten-Plausibilität + UTM-Reprojektion inklusive.

/** Plausibilität: Punkt in der DE-Bbox? (verwirft kaputte Quell-Koords). */
export function inDeBbox(lat, lng) {
  return lat != null && lng != null && lat >= 47.2 && lat <= 55.1 && lng >= 5.8 && lng <= 15.1
}

/** Erste Tonnage-Zahl aus Freitext (replaceAll — sonst bleibt bei mehreren Kommas das relevante stehen). */
export function tonnageAusText(text) {
  if (!text) return null
  const m = String(text).replaceAll(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:t\b|to\b|tonnen)/i)
  return m ? Number(m[1]) : null
}

/** Erste Höhen-/Breiten-Meterzahl aus Freitext. */
export function meterAusText(text, schluessel = /(?:höhe|hoehe|breite|durchfahrt)/i) {
  if (!text) return null
  const s = String(text).replaceAll(",", ".")
  if (schluessel && !schluessel.test(s)) return null
  const m = s.match(/(\d+(?:\.\d+)?)\s*m\b/)
  return m ? Number(m[1]) : null
}

/** ISO-Datum (YYYY-MM-DD) aus Timestamp/Datum, sonst null. */
export function dateOnly(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  if (m) return m[0]
  const d = String(v).match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
  if (d) {
    const yyyy = d[3].length === 2 ? "20" + d[3] : d[3]
    return `${yyyy}-${d[2]}-${d[1]}`
  }
  return null
}

const num = (v) => {
  if (v == null) return null
  const n = Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// ── Text-Extraktion ("Strip-downs") ───────────────────────────────────────────
// Viele Feeds (Autobahn, DATEX, Kommunen) packen Grenzwerte + Zeiträume NUR in den Freitext
// ("Maximale Durchfahrtsbreite: 10.75 m", "15.06.26 von 07:00 bis 19:00 Uhr"). Diese regelbasierten
// Extraktoren ziehen daraus strukturierte Stammdaten. Langfristig kommt ein LLM dahinter — bis dahin
// konservative Regex-Heuristiken (lieber nichts als falsch). Datums-Heuristik: kleinstes Datum = Start,
// größtes = Ende (Max-Vorgabe). Werte landen NUR in Lücken (vom Connector gesetzte Felder gewinnen).

/** Erste Meter-Angabe nach einem Schlüsselwort ("Breite … 3,5 m") → Zahl, sonst null. */
function masszahlNachWort(text, wortRe) {
  const m = String(text).replaceAll(",", ".").match(
    new RegExp(`(?:${wortRe})[^0-9]{0,14}?(\\d{1,3}(?:\\.\\d{1,2})?)\\s*m\\b`, "i"),
  )
  return m ? Number(m[1]) : null
}

/** Alle Datumsangaben (DD.MM.[YY]YY + ISO) → sortierte, plausible ISO-Liste (YYYY-MM-DD). */
function alleDaten(text) {
  const out = new Set()
  for (const m of String(text).matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g)) {
    const tag = m[1].padStart(2, "0"), mon = m[2].padStart(2, "0")
    const jahr = m[3].length === 2 ? "20" + m[3] : m[3]
    if (Number(mon) >= 1 && Number(mon) <= 12 && Number(tag) >= 1 && Number(tag) <= 31) out.add(`${jahr}-${mon}-${tag}`)
  }
  for (const m of String(text).matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`)
  return [...out].filter((d) => d >= "2000-01-01" && d <= "2100-12-31").sort()
}

/**
 * Strukturierte Stammdaten aus Freitext ziehen. Liefert nur gefundene Felder:
 *   { restbreiteM?, maxHoeheM?, maxGewichtT?, sperrlaengeM?, gueltigVon?, gueltigBis?, zeitfenster? }
 * Konservativ: Maße brauchen ihr Schlüsselwort, Daten müssen plausibel sein.
 */
export function extractStammdaten(text) {
  if (!text) return {}
  const s = String(text)
  const norm = s.replaceAll(",", ".")
  const out = {}

  const breite = masszahlNachWort(s, "durchfahrtsbreite|durchfahrbreite|fahrbahnbreite|restbreite|breite")
  if (breite != null) out.restbreiteM = breite
  const hoehe = masszahlNachWort(s, "durchfahrtsh(?:ö|oe)he|lichte\\s+h(?:ö|oe)he|h(?:ö|oe)he")
  if (hoehe != null) out.maxHoeheM = hoehe
  const gewicht = tonnageAusText(s)
  if (gewicht != null) out.maxGewichtT = gewicht
  // Länge der Maßnahme/Baustelle: "Länge: 24.92 km" → Meter (informativ, kein Fahrzeug-Limit).
  const laengeKm = norm.match(/l(?:ä|ae)ng[e]?[^0-9]{0,8}?(\d{1,3}(?:\.\d{1,2})?)\s*km\b/i)
  const laengeM = norm.match(/l(?:ä|ae)ng[e]?[^0-9]{0,8}?(\d{1,4}(?:\.\d{1,2})?)\s*m\b/i)
  if (laengeKm) out.sperrlaengeM = Math.round(Number(laengeKm[1]) * 1000)
  else if (laengeM) out.sperrlaengeM = Math.round(Number(laengeM[1]))

  // Zeitfenster: "von 07:00 bis 19:00 Uhr" / "07.00-19.00".
  const zf = s.match(/(\d{1,2})[:.](\d{2})\s*(?:bis|-|–|—)\s*(\d{1,2})[:.](\d{2})/)
  if (zf) out.zeitfenster = `${zf[1].padStart(2, "0")}:${zf[2]}–${zf[3].padStart(2, "0")}:${zf[4]}`

  // Datums-Heuristik: kleinstes = Start, größtes = Ende.
  const daten = alleDaten(s)
  if (daten.length >= 1) {
    out.gueltigVon = daten[0]
    if (daten.length >= 2 && daten[daten.length - 1] !== daten[0]) out.gueltigBis = daten[daten.length - 1]
  }
  return out
}

/** Kurzer, stabiler Hash (FNV-1a → base36). Für eindeutige, deterministische externeIds:
 *  Quell-IDs mancher Feeds sind nicht eindeutig (null/Dublette) → beim Upsert auf (quelle, externe_id)
 *  überschreiben sich Datensätze gegenseitig. Ein Geometrie-Suffix `${base}#${stabilHash(lat,lng,...)}`
 *  macht sie eindeutig OHNE Run-zu-Run-Drift (gleiche Geometrie → gleicher Hash → reconcile-stabil). */
export function stabilHash(...teile) {
  const s = teile.map((t) => (t == null ? "" : String(t))).join("|")
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Baut ein NormalizedObstacle für den Importer (validateObstacle/insertObstacle).
 * Kaputte Koords (außerhalb DE) → null (Item wird dann mangels lat/lng übersprungen).
 * attrs: nur numerische/boolesche Grenzwerte; leere/null-Werte werden gefiltert.
 */
export function makeNormalized({
  externeId, kategorie, name = null, beschreibung = null, lat, lng,
  strassenRef = null, attrs = {}, gueltigVon = null, gueltigBis = null, realerStart = null,
  quelleName = null, quelleUrl = null,
}) {
  let nlat = lat != null ? Number(lat) : null
  let nlng = lng != null ? Number(lng) : null
  if (nlat != null && nlng != null && !inDeBbox(nlat, nlng)) {
    nlat = null
    nlng = null
  }
  const cleanAttrs = Object.fromEntries(
    Object.entries(attrs || {}).filter(([, v]) => v != null && (typeof v === "number" || typeof v === "boolean")),
  )
  return {
    externeId: externeId != null ? String(externeId) : null,
    kategorie,
    name: name != null ? String(name).slice(0, 240) : null,
    beschreibung: beschreibung != null ? String(beschreibung) : null,
    lat: nlat,
    lng: nlng,
    strassenRef: strassenRef != null ? String(strassenRef) : null,
    attrs: cleanAttrs,
    gueltigVon: dateOnly(gueltigVon),
    gueltigBis: dateOnly(gueltigBis),
    realerStart: dateOnly(realerStart),
    quelle: { name: quelleName, url: quelleUrl, aktualisiertAm: new Date().toISOString() },
  }
}

/** GET → JSON (Timeout, Fehler → null). */
export async function getJson(url, { timeoutMs = 30000, headers = {} } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "roadmap-connector/1.0", ...headers } })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** GET → Text. */
export async function getText(url, { timeoutMs = 30000, headers = {} } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "roadmap-connector/1.0", ...headers } })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/** Paginierter WFS/OGC-API-Voll-Abruf → GeoJSON-Features. */
export async function fetchAllFeatures(baseUrl, { mode = "wfs2", pageSize = 1000, maxPages = 50, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const sep = baseUrl.includes("?") ? "&" : "?"
    let url
    if (mode === "wfs2") url = `${baseUrl}${sep}count=${pageSize}&startIndex=${page * pageSize}`
    else if (mode === "wfs1") url = `${baseUrl}${sep}maxFeatures=${pageSize}`
    else url = `${baseUrl}${sep}limit=${pageSize}&offset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data?.features ?? []
    all.push(...feats)
    if (feats.length < pageSize || mode === "wfs1") break
  }
  return all
}

/** Erster Punkt (lng,lat) aus einer GeoJSON-Geometrie; UTM (>1000) → WGS84 reprojiziert. */
export function ersterPunkt(geom, zone = 32) {
  if (!geom || !geom.coordinates) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c)) return [null, null]
  if (Math.abs(c[0]) > 1000) return utmZuWgs84(c[0], c[1], zone)
  return [c[0], c[1]]
}

export { num }

/** UTM (EPSG:25832 Zone 32 / 25833 Zone 33, ETRS89≈WGS84) → [lng, lat]. */
export function utmZuWgs84(easting, northing, zone = 32) {
  const a = 6378137.0, f = 1 / 298.257223563
  const k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const x = easting - 500000.0, y = northing
  const M = y / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const phi1 =
    mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = ep2 * Math.cos(phi1) ** 2
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
  const D = x / (N1 * k0)
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720)
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1)
  const lng0 = (zone * 6 - 183) * (Math.PI / 180)
  return [(lng0 + lng) * (180 / Math.PI), lat * (180 / Math.PI)]
}
