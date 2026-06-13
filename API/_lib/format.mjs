// Gemeinsame Normalisierungs-Helfer für die Cron-Jobs (Schnittstelle → Roadmap-Format v1.0).
// Bewusst dependency-frei (nur Node-Builtins). Die Cron-Jobs sind standalone und schreiben
// NICHT in die DB — sie mappen den Quell-Datenbestand in unser obstacle-Format und geben es aus.
// Ziel-Spec: ../../docs/HINDERNIS-DATENFORMAT.md (v1.0).

export const KATEGORIEN = [
  "bruecke", "tunnel", "engstelle", "baustelle", "sperrung",
  "gewicht", "bahnuebergang", "kreisverkehr", "ampel", "steigung",
]

/** Straßenklasse aus einer Referenz wie "A1", "B 215", "L3020", "K12". */
export function strassenklasseAusRef(ref) {
  if (!ref) return null
  const s = String(ref).trim().toUpperCase()
  if (/^A\s?\d/.test(s)) return "A"
  if (/^B\s?\d/.test(s)) return "B"
  if (/^L\s?\d/.test(s)) return "L"
  if (/^K\s?\d/.test(s)) return "K"
  return "sonstige"
}

/** Baulastträger aus der Straßenklasse (Prinzip A der Priorisierung). */
export function baulasttraegerAusKlasse(klasse) {
  return { A: "bund", B: "bund", L: "land", K: "kreis", G: "kommune" }[klasse] ?? null
}

/** Erste Tonnage-Zahl aus Freitext, z.B. "...auf 3,5 t beschränkt" → 3.5.
 *  replaceAll (nicht replace) — sonst bleibt bei mehreren Kommas im Text das relevante
 *  Komma unkonvertiert (z.B. "S140 (400/60,3/2,0) 3,5t" → fälschlich 5 statt 3,5 t). */
export function tonnageAusText(text) {
  if (!text) return null
  const m = String(text).replaceAll(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:t\b|to\b|tonnen)/i)
  return m ? Number(m[1]) : null
}

/** Erste Höhen-/Meter-Zahl aus Freitext, z.B. "Durchfahrtshöhe 3,80 m" → 3.8. */
export function meterAusText(text, schluessel = /(?:höhe|hoehe|breite|durchfahrt)/i) {
  if (!text) return null
  const s = String(text).replaceAll(",", ".")
  if (schluessel && !schluessel.test(s)) return null
  const m = s.match(/(\d+(?:\.\d+)?)\s*m\b/)
  return m ? Number(m[1]) : null
}

/** Plausibilitäts-Check: liegt der Punkt in der DE-Bbox? Schützt vor kaputten Quell-Koords
 *  (z.B. verstümmelte UTM-Werte, die nach WGS84 in den Atlantik reprojizieren). */
export function inDeBbox(lat, lng) {
  return lat != null && lng != null &&
    lat >= 47.2 && lat <= 55.1 && lng >= 5.8 && lng <= 15.1
}

/**
 * Baut ein normalisiertes Hindernis im Roadmap-Format v1.0.
 * fach_id / cluster_id / rangscore / confidence werden NICHT hier vergeben (DB-seitig).
 */
export function makeObstacle({
  quellenId, externeId, kategorie, befristung = "temporaer",
  name = null, beschreibung = null, lat, lng, geom = null, richtung = "beide",
  strassenRef = null, vnk = null, nnk = null, stationVon = null, stationBis = null,
  attrs = {}, gueltigVon = null, gueltigBis = null, realerStart = null,
  zeitfenster = null, quelleName = null, quelleUrl = null, roh = null,
  status = "gemeldet", abgerufenAm,
}) {
  const klasse = strassenklasseAusRef(strassenRef)
  // Kaputte Quell-Koordinaten (außerhalb DE-Bbox) verwerfen statt falsch zu kartieren.
  let nlat = lat != null ? Number(lat) : null
  let nlng = lng != null ? Number(lng) : null
  if (nlat != null && nlng != null && !inDeBbox(nlat, nlng)) {
    nlat = null
    nlng = null
  }
  return {
    quellen_id: quellenId,
    externe_id: externeId != null ? String(externeId) : null,
    kategorie,
    befristung,
    name,
    beschreibung,
    lat: nlat,
    lng: nlng,
    geom,
    richtung,
    strassen_ref: strassenRef,
    strassenklasse: klasse,
    baulasttraeger: baulasttraegerAusKlasse(klasse),
    vnk, nnk, station_von: stationVon, station_bis: stationBis,
    attrs,
    gueltig_von: gueltigVon,
    gueltig_bis: gueltigBis,
    realer_start: realerStart,
    zeitfenster,
    quelle: { name: quelleName, url: quelleUrl, abgerufenAm },
    roh,
    status,
    abgerufen_am: abgerufenAm,
  }
}

/** ISO-Datum (YYYY-MM-DD) aus einem Timestamp/Datum-String, sonst null. */
export function dateOnly(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  if (m) return m[0]
  const d = String(v).match(/(\d{2})\.(\d{2})\.(\d{2,4})/) // DD.MM.YYYY
  if (d) {
    const yyyy = d[3].length === 2 ? "20" + d[3] : d[3]
    return `${yyyy}-${d[2]}-${d[1]}`
  }
  return null
}

/** GET → JSON, mit Timeout + Fehlertext. */
export async function getJson(url, { timeoutMs = 30000, headers = {} } = {}) {
  const ctrl = AbortSignal.timeout(timeoutMs)
  const r = await fetch(url, { headers: { "user-agent": "roadmap-cron/1.0", ...headers }, signal: ctrl })
  if (!r.ok) throw new Error(`HTTP ${r.status} bei ${url}`)
  return r.json()
}

/** GET → Text. */
export async function getText(url, { timeoutMs = 30000, headers = {} } = {}) {
  const ctrl = AbortSignal.timeout(timeoutMs)
  const r = await fetch(url, { headers: { "user-agent": "roadmap-cron/1.0", ...headers }, signal: ctrl })
  if (!r.ok) throw new Error(`HTTP ${r.status} bei ${url}`)
  return r.text()
}

/**
 * Paginierter WFS/OGC-API-Voll-Abruf als GeoJSON-Features.
 * mode "wfs2": &count=&startIndex= · "wfs1": &maxFeatures=  · "ogcapi": ?limit=&offset=
 * Zieht den GESAMTEN Bestand (bis kein neuer Datensatz mehr kommt), capped via maxPages.
 */
export async function fetchAllFeatures(baseUrl, { mode = "wfs2", pageSize = 1000, maxPages = 50, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const sep = baseUrl.includes("?") ? "&" : "?"
    let url
    if (mode === "wfs2") url = `${baseUrl}${sep}count=${pageSize}&startIndex=${page * pageSize}`
    else if (mode === "wfs1") url = `${baseUrl}${sep}maxFeatures=${pageSize}` // wfs1 kann oft kein Offset → eine Seite
    else url = `${baseUrl}${sep}limit=${pageSize}&offset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data.features ?? []
    all.push(...feats)
    if (feats.length < pageSize || mode === "wfs1") break
  }
  return all
}

/**
 * EINZIGER Output-Sink der Cron-Jobs (pull + Format-Bau passieren davor im Job selbst —
 * kein zweiter Schritt). Schreibt das Verifikations-JSON IMMER (zum Reinschauen). Wenn
 * `ROADMAP_WRITE_DB=1` gesetzt ist (und DATABASE_URL da + Migration 005 angewandt), schreibt
 * derselbe Aufruf die Datensätze zusätzlich direkt in die obstacles-DB (Upsert) — integriert,
 * nicht als separates Tool. Default: AUS (Dry-Run), bis das Format abgenommen ist.
 */
export async function schreibeErgebnis(dir, basename, { quelle, verfuegbar, obstacles }) {
  const { writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const beispiele = obstacles.slice(0, 3)
  const out = {
    quelle,
    abgerufen_am: obstacles[0]?.abgerufen_am ?? null,
    anzahl_verfuegbar: verfuegbar,
    anzahl_normalisiert: obstacles.length,
    db_geschrieben: null,
    beispiele,
    alle: obstacles.slice(0, 500), // Verifikation: max 500 Datensätze auf Platte
  }

  // Integrierte DB-Schreibfunktion — scharf nur via ENV (sonst reiner Dry-Run).
  if (process.env.ROADMAP_WRITE_DB === "1") {
    const { writeObstaclesToDb } = await import("./db.mjs")
    out.db_geschrieben = await writeObstaclesToDb(obstacles, quelle)
    console.log(`→ DB: ${out.db_geschrieben.neu} neu, ${out.db_geschrieben.aktualisiert} aktualisiert`)
  }

  await writeFile(join(dir, `${basename}.normalisiert.json`), JSON.stringify(out, null, 2), "utf-8")
  return out
}

/** UTM (EPSG:25832 Zone 32N / 25833 Zone 33N, ETRS89≈WGS84) → [lng, lat]. Dependency-frei. */
export function utmZuWgs84(easting, northing, zone = 32) {
  const a = 6378137.0, f = 1 / 298.257223563
  const k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const x = easting - 500000.0, y = northing
  const M = y / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = ep2 * Math.cos(phi1) ** 2
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
  const D = x / (N1 * k0)
  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720)
  const lng =
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
    Math.cos(phi1)
  const lng0 = (zone * 6 - 183) * (Math.PI / 180)
  return [(lng0 + lng) * (180 / Math.PI), lat * (180 / Math.PI)]
}
