// Idempotenter Seed (feste UUIDs, Upserts): ~30 Demo-Hindernisse entlang der
// Demo-Korridore + 3 Demo-Projekte (analog src/lib/mock/seed.ts).
//
// Determinismus: Hindernisse werden exakt AUF die deterministische
// Fallback-Geometrie der Demo-Routen gelegt und die Seed-Analyse läuft ohne
// externe Provider (Nominatim/OSRM = null) — so liefert die Demo-Analyse
// reproduzierbar Funde, komplett offline. demo=true markiert alles sauber;
// `node scripts/seed.js --remove-demo` räumt wieder auf.

import { createDb, createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"
import { buildPolyline } from "../src/engine/fallback.js"
import { cumulativeKm } from "../src/engine/geometry.js"
import { runAnalysis } from "../src/engine/index.js"
import { geocodeOrt, routeKey } from "../src/engine/resolveRoute.js"
import { buildSourcePool, pickDeterministic, ZUSTAENDIG_POOL } from "../src/data/sources.js"
import { fmtKomma } from "../src/engine/rules.js"

loadEnv()

const pool = createPool()
const db = createDb(pool)

const OBSTACLE_ID = (i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`
const PROJECT_ID = (i) => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, "0")}`

const DAY_MS = 86_400_000
const isoDate = (daysFromNow) =>
  new Date(Date.now() + daysFromNow * DAY_MS).toISOString().slice(0, 10)

/** YYYY-MM-DDTHH:mm relativ zu jetzt (lokal) — Format wie der FE-Mock. */
function isoLocal(daysFromNow, hour, minute = 0) {
  const d = new Date(Date.now() + daysFromNow * DAY_MS)
  d.setHours(hour, minute, 0, 0)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Demo-Projekte (analog src/lib/mock/seed.ts) ───────────────────────────────

const PROJECTS = [
  {
    id: PROJECT_ID(1),
    name: "Trafo-Transport Hamburg → München",
    route: { mode: "startziel", start: "Hamburg", ziel: "München", vias: ["Hannover", "Würzburg"] },
    transport: {
      fahrzeugTyp: "Sattelzug mit Tieflader",
      laenge: 26.5, breite: 3.2, hoehe: 4.4,
      gesamtgewicht: 92, achslast: 12, achsen: 10,
      ladung: "Leistungstransformator 80 t",
    },
    zeitraum: { von: isoLocal(14, 22), bis: isoLocal(16, 14) },
    ageDays: 6,
    analyse: true,
  },
  {
    id: PROJECT_ID(2),
    name: "Windkraft-Rotorblatt Bremen → Leipzig",
    route: { mode: "startziel", start: "Bremen", ziel: "Leipzig", vias: ["Hannover"] },
    transport: {
      fahrzeugTyp: "Selbstfahrer mit Rotorblattadapter",
      laenge: 62, breite: 4.0, hoehe: 4.6,
      gesamtgewicht: 78, achslast: 10, achsen: 12,
      ladung: "Rotorblatt 58 m",
    },
    zeitraum: { von: isoLocal(14, 22), bis: isoLocal(16, 14) },
    ageDays: 2,
    analyse: true,
  },
  {
    id: PROJECT_ID(3),
    name: "Baumaschine Köln → Stuttgart",
    route: { mode: "startziel", start: "Köln", ziel: "Stuttgart" },
    transport: {
      fahrzeugTyp: "Tieflader",
      laenge: 22, breite: 3.0, hoehe: 3.9,
      gesamtgewicht: 64, achslast: 11, achsen: 8,
      ladung: "Raupenbagger 45 t",
    },
    zeitraum: { von: isoLocal(28, 22), bis: isoLocal(30, 14) },
    ageDays: 1,
    analyse: false, // bleibt Entwurf
  },
]

// ── Demo-Hindernisse: { frac, kategorie, name, road, attrs, gueltig? } ────────
// frac = Position entlang des jeweiligen Demo-Korridors (0..1).

const CORRIDORS = [
  {
    project: PROJECTS[0], // A7-Korridor HH → München
    obstacles: [
      { frac: 0.06, kategorie: "bruecke", name: "Brücke Seevetal", road: "A7", attrs: { maxHoeheM: 4.42 } },
      { frac: 0.12, kategorie: "baustelle", name: "Baustelle Soltau", road: "A7", attrs: { restbreiteM: 3.1 }, gueltigVon: isoDate(-14), gueltigBis: isoDate(90) },
      { frac: 0.2, kategorie: "engstelle", name: "Engstelle Hildesheim", road: "A7", attrs: { maxBreiteM: 3.55 } },
      { frac: 0.28, kategorie: "gewicht", name: "Traglastgrenze Werratalbrücke", road: "A7", attrs: { maxGewichtT: 60, maxAchslastT: 11.5 } },
      { frac: 0.35, kategorie: "bruecke", name: "Brücke Göttingen-Nord", road: "A7", attrs: { maxHoeheM: 4.75 } },
      { frac: 0.42, kategorie: "kreisverkehr", name: "Kreisverkehr Umleitung Kassel", road: "B3", attrs: { radiusM: 14 } },
      { frac: 0.5, kategorie: "tunnel", name: "Tunnel Hann. Münden", road: "A7", attrs: { maxHoeheM: 4.5 } },
      { frac: 0.58, kategorie: "bahnuebergang", name: "Bahnübergang Fulda-Süd", road: "B27", attrs: { maxHoeheM: 5.5 } },
      { frac: 0.66, kategorie: "steigung", name: "Steigung Kasseler Berge", road: "A7", attrs: { steigungPct: 8.5 } },
      { frac: 0.74, kategorie: "ampel", name: "Signalanlage Würzburg-Heidingsfeld", road: "B19", attrs: { maxHoeheM: 4.5 } },
      { frac: 0.82, kategorie: "baustelle", name: "Baustelle Ansbach", road: "A7", attrs: { restbreiteM: 3.6 }, gueltigVon: isoDate(-30), gueltigBis: isoDate(120) },
      { frac: 0.9, kategorie: "bruecke", name: "Brücke Allershausen", road: "A9", attrs: { maxHoeheM: 5.1 } },
    ],
  },
  {
    project: PROJECTS[1], // A2-Korridor Bremen → Leipzig
    obstacles: [
      { frac: 0.08, kategorie: "engstelle", name: "Engstelle Achim", road: "A27", attrs: { maxBreiteM: 4.05 } },
      { frac: 0.18, kategorie: "bruecke", name: "Brücke Nienburg", road: "B6", attrs: { maxHoeheM: 4.95 } },
      { frac: 0.3, kategorie: "kreisverkehr", name: "Kreisverkehr Lehrte", road: "B443", attrs: { radiusM: 26 } },
      { frac: 0.4, kategorie: "gewicht", name: "Traglastgrenze Elbbrücke Magdeburg", road: "A2", attrs: { maxGewichtT: 85, maxAchslastT: 11 } },
      { frac: 0.52, kategorie: "baustelle", name: "Baustelle Helmstedt", road: "A2", attrs: { restbreiteM: 3.9 }, gueltigVon: isoDate(-7), gueltigBis: isoDate(60) },
      { frac: 0.62, kategorie: "steigung", name: "Steigung Harzvorland", road: "B81", attrs: { steigungPct: 5.5 } },
      { frac: 0.72, kategorie: "bahnuebergang", name: "Bahnübergang Köthen", road: "B183", attrs: { maxHoeheM: 4.55 } },
      { frac: 0.84, kategorie: "ampel", name: "Signalanlage Halle-Peißen", road: "B100", attrs: { maxHoeheM: 4.5 } },
      { frac: 0.92, kategorie: "tunnel", name: "Unterführung Leipzig-Wahren", road: "A9", attrs: { maxHoeheM: 5.2 } },
    ],
  },
  {
    project: PROJECTS[2], // A3/A8-Korridor Köln → Stuttgart
    obstacles: [
      { frac: 0.1, kategorie: "bruecke", name: "Brücke Siebengebirge", road: "A3", attrs: { maxHoeheM: 3.95 } },
      { frac: 0.2, kategorie: "baustelle", name: "Baustelle Montabaur", road: "A3", attrs: { restbreiteM: 3.05 }, gueltigVon: isoDate(-21), gueltigBis: isoDate(150) },
      { frac: 0.32, kategorie: "engstelle", name: "Engstelle Limburg", road: "A3", attrs: { maxBreiteM: 3.3 } },
      { frac: 0.42, kategorie: "gewicht", name: "Traglastgrenze Mainbrücke", road: "A67", attrs: { maxGewichtT: 72 } },
      { frac: 0.52, kategorie: "kreisverkehr", name: "Kreisverkehr Heppenheim", road: "B460", attrs: { radiusM: 12 } },
      { frac: 0.62, kategorie: "steigung", name: "Steigung Odenwald", road: "B37", attrs: { steigungPct: 9 } },
      { frac: 0.72, kategorie: "bahnuebergang", name: "Bahnübergang Sinsheim", road: "B292", attrs: { maxHoeheM: 5.0 } },
      { frac: 0.82, kategorie: "tunnel", name: "Tunnel Heslach", road: "B14", attrs: { maxHoeheM: 4.0 } },
      { frac: 0.92, kategorie: "ampel", name: "Signalanlage Stuttgart-Zuffenhausen", road: "B10", attrs: { maxHoeheM: 4.5 } },
    ],
  },
]

// ── Helfer ────────────────────────────────────────────────────────────────────

/** Punkt + km-Marke bei Streckenanteil frac entlang der Geometrie. */
function pointAt(geometry, cum, frac) {
  const target = frac * cum[cum.length - 1]
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= target) {
      const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
      const a = geometry[i - 1]
      const b = geometry[i]
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, km: target }
    }
  }
  const last = geometry[geometry.length - 1]
  return { lat: last.lat, lng: last.lng, km: cum[cum.length - 1] }
}

async function resolveWaypoints(route) {
  const orte = [route.start, ...(route.vias ?? []), route.ziel].filter(Boolean)
  const out = []
  for (const ort of orte) {
    const hit = await geocodeOrt(db, null, ort) // Cache → Städte-Tabelle, kein Netz
    out.push({ lat: hit.lat, lng: hit.lng })
  }
  return out
}

async function removeDemo() {
  const o = await db.query("DELETE FROM obstacles WHERE demo = true", [])
  for (const p of PROJECTS) await db.query("DELETE FROM projects WHERE id = $1", [p.id])
  console.log(`removed: ${o.rowCount} demo-obstacles, demo-projects (findings/runs via cascade)`)
}

async function upsertObstacle(o) {
  await db.query(
    `INSERT INTO obstacles (id, kategorie, name, beschreibung, lat, lng, strassen_ref,
       zustaendig, quelle, attrs, gueltig_von, gueltig_bis, aktiv, demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, true)
     ON CONFLICT (id) DO UPDATE SET kategorie = EXCLUDED.kategorie, name = EXCLUDED.name,
       beschreibung = EXCLUDED.beschreibung, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       strassen_ref = EXCLUDED.strassen_ref, zustaendig = EXCLUDED.zustaendig,
       quelle = EXCLUDED.quelle, attrs = EXCLUDED.attrs, gueltig_von = EXCLUDED.gueltig_von,
       gueltig_bis = EXCLUDED.gueltig_bis, aktiv = true, demo = true, updated_at = now()`,
    [o.id, o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef,
      o.zustaendig, JSON.stringify(o.quelle), JSON.stringify(o.attrs),
      o.gueltigVon, o.gueltigBis],
  )
}

async function seed() {
  let obstacleIndex = 0
  let count = 0

  for (const corridor of CORRIDORS) {
    const project = corridor.project
    const waypoints = await resolveWaypoints(project.route)
    const geometry = buildPolyline(waypoints)
    const cum = cumulativeKm(geometry)

    // route_cache für diese Waypoints leeren, damit die Seed-Analyse exakt
    // die Fallback-Geometrie nutzt, auf der die Hindernisse liegen.
    await db.query("DELETE FROM route_cache WHERE key = $1", [routeKey(waypoints)])

    for (const def of corridor.obstacles) {
      obstacleIndex += 1
      const pos = pointAt(geometry, cum, def.frac)
      const strassenRef = `${def.road} km ${fmtKomma(pos.km, 1)}`
      const ctx = { lat: pos.lat, lng: pos.lng, strassenRef, aktualisiertAm: isoDate(0) }
      const source = pickDeterministic(buildSourcePool(def.kategorie, ctx), def.name)
      await upsertObstacle({
        id: OBSTACLE_ID(obstacleIndex),
        kategorie: def.kategorie,
        name: def.name,
        beschreibung: `Demo-Hindernis am Korridor „${project.name}“.`,
        lat: pos.lat,
        lng: pos.lng,
        strassenRef,
        zustaendig: pickDeterministic(ZUSTAENDIG_POOL[def.kategorie], def.name) ?? null,
        quelle: { ...source, name: `Demo-Datensatz · ${source.name}` },
        attrs: def.attrs,
        gueltigVon: def.gueltigVon ?? null,
        gueltigBis: def.gueltigBis ?? null,
      })
      count += 1
    }
  }
  console.log(`upserted ${count} demo-obstacles`)

  for (const p of PROJECTS) {
    const created = new Date(Date.now() - p.ageDays * DAY_MS).toISOString()
    await db.query(
      `INSERT INTO projects (id, name, status, route_input, transport, zeitraum,
         route_geometry, created_by, created_at, updated_at)
       VALUES ($1, $2, 'entwurf', $3, $4, $5, '[]', 'demo@setreo', $6, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, route_input = EXCLUDED.route_input,
         transport = EXCLUDED.transport, zeitraum = EXCLUDED.zeitraum, updated_at = now()`,
      [p.id, p.name, JSON.stringify(p.route), JSON.stringify(p.transport),
        JSON.stringify(p.zeitraum), created],
    )
  }
  console.log(`upserted ${PROJECTS.length} demo-projects`)

  for (const p of PROJECTS) {
    if (!p.analyse) continue
    const result = await runAnalysis({
      db,
      project: { id: p.id, route: p.route, transport: p.transport, zeitraum: p.zeitraum },
      deps: { nominatim: null, osrm: null }, // offline-deterministisch
      corridorM: Number(process.env.CORRIDOR_M ?? 120),
    })
    console.log(
      `analysed "${p.name}": ${result.findings.length} findings ` +
      `(${result.stats.kritisch} kritisch, ${result.stats.warnung} warnung), ${result.distanzKm} km`,
    )
  }
}

try {
  if (process.argv.includes("--remove-demo")) {
    await removeDemo()
  } else {
    await seed()
  }
} finally {
  await pool.end()
}
