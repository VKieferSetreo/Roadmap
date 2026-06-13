#!/usr/bin/env node
// VORLAGE für WFS/OGC-API-GeoJSON-Quellen. Kopieren → <apiname>.cron.mjs im Quell-Ordner,
// Import-Tiefe an die Ebene anpassen (Bundesweit/Sonstige: ../../_lib/ · Länder: ../../../_lib/
// · Städte: ../../../../../_lib/). Zieht den GESAMTEN Bestand, mappt in unser obstacle-Format
// v1.0, schreibt <apiname>.normalisiert.json (Verifikation, KEINE DB, NICHT die Engine).
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  makeObstacle, fetchAllFeatures, schreibeErgebnis, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "../../_lib/format.mjs" // ← Tiefe anpassen!

const QUELLE = "01XX"                  // ← Quellen-ID vergeben
const QUELLE_NAME = "..."              // ← aus abdeckung.txt
const HIER = dirname(fileURLToPath(import.meta.url))
const now = new Date().toISOString()

// GESAMTER Bestand. WFS 2.0 in WGS84 anfragen, wenn der Dienst es kann (srsName=EPSG:4326),
// sonst utmZuWgs84(...) auf die Koordinaten anwenden (EPSG:25832 → zone 32, :25833 → zone 33).
const BASE =
  "https://.../ows?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=NS:Layer&outputFormat=application/json&srsName=EPSG:4326"
const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 50 })

const obstacles = feats.map((f) => {
  const p = f.properties ?? {}
  // Referenzpunkt aus der Geometrie ziehen (erste Koordinate; bei UTM reprojizieren):
  const [lng, lat] = ersterPunkt(f.geometry)
  return makeObstacle({
    quellenId: QUELLE,
    externeId: f.id ?? p.id ?? p.OBJECTID,
    kategorie: "baustelle",            // ← je Quelle mappen (bruecke/baustelle/sperrung/…)
    befristung: "temporaer",           // ← dauerhaft bei Bauwerken
    name: p.name ?? p.bezeichnung ?? null,
    beschreibung: p.beschreibung ?? null,
    lat, lng,
    geom: f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString" ? f.geometry : null,
    strassenRef: p.strasse ?? p.strassenname ?? null,
    attrs: cleanAttrs({
      maxHoeheM: numOrNull(p.Höhenbeschränkung),
      maxGewichtT: numOrNull(p.Gewichtsbeschränkung) ?? tonnageAusText(p.beschreibung),
    }),
    realerStart: dateOnly(p.beginn ?? p.von),
    gueltigBis: dateOnly(p.ende ?? p.bis),
    quelleName: QUELLE_NAME, quelleUrl: "...", roh: p, abgerufenAm: now,
  })
})

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  // Heuristik: Werte > 1000 = UTM → reprojizieren (Zone aus Easting-Größe schätzen, meist 32)
  if (Math.abs(c[0]) > 1000) return utmZuWgs84(c[0], c[1], 32)
  return [c[0], c[1]]
}
function numOrNull(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null }
function cleanAttrs(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) }

const erg = await schreibeErgebnis(HIER, "REPLACE", { quelle: { id: QUELLE, name: QUELLE_NAME }, verfuegbar: feats.length, obstacles })
console.log(`=== VERIFIKATION ===\nverfügbar: ${feats.length} · normalisiert: ${obstacles.length}`)
console.log(`mit lat/lng:`, obstacles.filter((o) => o.lat != null).length)
console.log(JSON.stringify(erg.beispiele[0], null, 2))
