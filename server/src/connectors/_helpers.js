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
