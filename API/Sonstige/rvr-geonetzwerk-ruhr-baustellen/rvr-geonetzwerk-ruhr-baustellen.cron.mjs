#!/usr/bin/env node
// Cron-Job: RVR / GEONETZWERK.RUHR — Baustellen (Quellen-ID 0302).
// Zieht den GESAMTEN Baustellen-Bestand des Ruhrgebiet-GeoServers (Beispiel-Instanz Herne),
// mappt ihn in unser obstacle-Format v1.0 und schreibt das Ergebnis zur VERIFIKATION nach
// rvr-geonetzwerk-ruhr-baustellen.normalisiert.json. Schreibt NICHT in die DB, läuft NICHT in der Engine.
// Lauf:  node rvr-geonetzwerk-ruhr-baustellen.cron.mjs
//
// HINWEIS UMFANG/PAGINATION: Der Herne-Layer ist klein → ein einziger GetFeature-Request holt den
// vollen Bestand. Für laufenden Cron-Betrieb über mehrere Ruhr-Städte (geodaten.<stadt>.de) würde man
// die unten kommentierten Instanzen je Stadt durchlaufen und die Feature-Listen mergen (Pagination
// ≈ Instanz-Iteration). WFS-Offset (startIndex) ist hier nicht nötig (Layer < pageSize).
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeObstacle, getJson, utmZuWgs84, dateOnly, tonnageAusText, meterAusText, schreibeErgebnis } from "../../_lib/format.mjs"

const QUELLE = "0302"
const QUELLE_NAME = "RVR / GEONETZWERK.RUHR — Baustellen"
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// Ruhrgebiet-GeoServer (Pfad-Muster geodaten.<stadt>.de/geoserver/verkehr/baustellen).
// Herne ist die verifizierte Instanz; weitere Städte für Voll-Cron systematisch durchprobieren:
const INSTANZEN = [
  { stadt: "Herne", base: "https://geodaten.herne.de/geoserver/verkehr/baustellen" },
  // { stadt: "Essen",  base: "https://geodaten.essen.de/geoserver/verkehr/baustellen" },   // beim Test nicht aufgelöst
  // { stadt: "Bochum", base: "https://geodaten.bochum.de/geoserver/verkehr/baustellen" },  // im Voll-Cron prüfen
]

// GeoServer liefert GeoJSON in EPSG:25832 (UTM Zone 32N) → utmZuWgs84(...) reprojizieren.
function wfsUrl(base) {
  return `${base}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=baustelle&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG:25832`
}

function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

/** Referenzpunkt + LineString aus der UTM-Geometrie ziehen, alle Punkte nach WGS84 reprojizieren. */
function geomVonFeature(g) {
  if (!g) return { lat: null, lng: null, geom: null }
  if (g.type === "Point") {
    const [lng, lat] = utmZuWgs84(g.coordinates[0], g.coordinates[1], 32)
    return { lat, lng, geom: null }
  }
  if (g.type === "LineString") {
    const coords = g.coordinates.map(([e, n]) => utmZuWgs84(e, n, 32))
    return { lat: coords[0][1], lng: coords[0][0], geom: { type: "LineString", coordinates: coords } }
  }
  if (g.type === "MultiLineString") {
    const coords = g.coordinates.map((line) => line.map(([e, n]) => utmZuWgs84(e, n, 32)))
    return { lat: coords[0][0][1], lng: coords[0][0][0], geom: { type: "MultiLineString", coordinates: coords } }
  }
  return { lat: null, lng: null, geom: null }
}

/** "Teilsperrung mit LSA" / "Vollsperrung" → vollsperrung-Flag (true/undefined). */
function vollsperrung(einschr) {
  if (!einschr) return undefined
  return /vollsperr/i.test(einschr) ? true : undefined
}

const obstacles = []
let verfuegbar = 0
let erreichbar = 0

for (const inst of INSTANZEN) {
  let fc
  try {
    fc = await getJson(wfsUrl(inst.base), { timeoutMs: 45000 })
  } catch (e) {
    console.log(`Instanz ${inst.stadt} nicht erreichbar: ${e.message}`)
    continue
  }
  erreichbar++
  const feats = fc.features ?? []
  verfuegbar += feats.length
  console.log(`${inst.stadt}: ${feats.length} Baustellen`)

  for (const f of feats) {
    const p = f.properties ?? {}
    const { lat, lng, geom } = geomVonFeature(f.geometry)
    // strasse z.B. "Forellstr. A 43" — Straßenref (A/B/L/K) heuristisch extrahieren
    const refMatch = String(p.strasse ?? "").match(/\b([ABLK])\s?-?\s?(\d+)\b/i)
    const strassenRef = refMatch ? `${refMatch[1].toUpperCase()}${refMatch[2]}` : null
    const text = [p.massnahme, p.einschr, p.bemerkung].filter(Boolean).join(" · ")

    obstacles.push(makeObstacle({
      quellenId: QUELLE, externeId: p.gml_id ?? f.id, kategorie: "baustelle", befristung: "temporaer",
      name: p.massnahme ?? p.strasse ?? "Baustelle (RVR)",
      beschreibung: text || null,
      lat, lng, geom,
      strassenRef,
      attrs: cleanAttrs({
        vollsperrung: vollsperrung(p.einschr),
        restbreiteM: meterAusText(text, /breite/i),
        maxGewichtT: tonnageAusText(text),
      }),
      realerStart: dateOnly(p.beginn),
      gueltigVon: dateOnly(p.beginn),
      gueltigBis: dateOnly(p.ende),
      quelleName: `${QUELLE_NAME} (${inst.stadt})`, quelleUrl: inst.base,
      roh: p, abgerufenAm: now, status: "gemeldet",
    }))
  }
}

const erg = await schreibeErgebnis(HIER, "rvr-geonetzwerk-ruhr-baustellen", {
  quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar, obstacles,
})
console.log(`\n=== VERIFIKATION ===`)
console.log(`Instanzen erreichbar: ${erreichbar}/${INSTANZEN.length} · verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(`mit LineString-geom:`, obstacles.filter((o) => o.geom != null).length)
console.log(`Vollsperrungen:`, obstacles.filter((o) => o.attrs.vollsperrung).length)
console.log(`\nBeispiel-Datensatz (unser Format):`)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
