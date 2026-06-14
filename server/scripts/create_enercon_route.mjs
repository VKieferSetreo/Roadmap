// Einmaliges, idempotentes Anlegen EINER realen Strecke auf dem Enercon-Mandanten —
// im Format der übrigen Demo-Projekte (routes[]/transport/zeitraum), inkl. Auswertung.
//
// Strecke: Cuxhaven → Bleckmannshof bei Werne (NRW). Geometrie über Nominatim-Geocoding
// + (öffentliches) OSRM; fällt deterministisch auf buildPolyline zurück, falls OSRM
// nicht erreichbar ist. Fahrtzeitraum: 14.06.2026 ganztägig.
//
// Läuft im api-Container (hat DATABASE_URL + Internet):
//   node scripts/create_enercon_route.mjs
// Idempotent (feste Projekt-UUID, Upsert) → beliebig oft re-runbar.

import { createDb, createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"
import { createNominatim } from "../src/external/nominatim.js"
import { createOsrm } from "../src/external/osrm.js"
import { downsample, buildPolyline } from "../src/engine/fallback.js"
import { totalKm } from "../src/engine/geometry.js"
import { runAnalysis } from "../src/engine/index.js"
import { getTenantBySlug } from "../src/tenants.js"

loadEnv()
const pool = createPool()
const db = createDb(pool)

const TENANT_SLUG = "enercon"
const PROJECT_ID = "cccccccc-0000-4000-8000-000000000001"
const ROUTE_ID = "enercon-cux-werne-hin"

// Enercon-typischer WEA-Schwertransport (Turm-/Gondelsegment).
const TRANSPORT = {
  laenge: 35.0,
  breite: 4.2,
  hoehe: 4.4,
  gesamtgewicht: 92,
  achsen: 8,
  achslasten: [11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5],
}
// Fahrtdatum: nur 14.06.2026, ganztägig (00:00 → 23:59).
const ZEITRAUM = { von: "2026-06-14T00:00", bis: "2026-06-14T23:59", ganztaegig: true }

const log = (...a) => console.log("[enercon-route]", ...a)

/** Ersten Geocoding-Treffer über mehrere Kandidaten finden. */
async function geocodeFirst(nom, candidates) {
  for (const c of candidates) {
    const hit = await nom.geocode(c)
    if (hit) return { ...hit, query: c }
  }
  return null
}

async function main() {
  log("START", new Date().toISOString())

  // 1) Tenant auflösen (anlegen, falls noch nicht vorhanden).
  let tenant = await getTenantBySlug(db, TENANT_SLUG)
  if (!tenant) {
    const { rows } = await db.query(
      "INSERT INTO tenants (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id, slug, name",
      [TENANT_SLUG, "Enercon"],
    )
    tenant = rows[0] ?? (await getTenantBySlug(db, TENANT_SLUG))
    log("Tenant angelegt:", tenant?.slug, tenant?.id)
  } else {
    log("Tenant gefunden:", tenant.slug, tenant.id)
  }
  if (!tenant) throw new Error("Tenant enercon konnte nicht aufgelöst/angelegt werden")

  // 2) Start + Ziel geocoden.
  const nom = createNominatim({ timeoutMs: 15000 })
  const osrm = createOsrm({ timeoutMs: 20000 })
  const start = await geocodeFirst(nom, ["Cuxhaven, Niedersachsen, Deutschland", "Cuxhaven"])
  const ziel = await geocodeFirst(nom, [
    "Bleckmannshof, Werne, Nordrhein-Westfalen, Deutschland",
    "Bleckmanns Hof, Werne",
    "Werne, Nordrhein-Westfalen, Deutschland",
    "Werne",
  ])
  if (!start || !ziel) throw new Error(`Geocoding fehlgeschlagen: start=${!!start} ziel=${!!ziel}`)
  log("Start:", start.query, "→", start.lat, start.lng, "|", start.displayName)
  log("Ziel: ", ziel.query, "→", ziel.lat, ziel.lng, "|", ziel.displayName)

  // 3) Route (OSRM) → Geometrie; Fallback deterministische Polyline.
  const wp = [
    { lat: start.lat, lng: start.lng },
    { lat: ziel.lat, lng: ziel.lng },
  ]
  let points
  let router = "osrm"
  const routed = await osrm.route(wp)
  if (routed && Array.isArray(routed.geometry) && routed.geometry.length >= 2) {
    points = downsample(routed.geometry)
  } else {
    router = "fallback"
    points = buildPolyline(wp)
  }
  log(`Route: ${points.length} Punkte über ${router}, ~${Math.round(totalKm(points))} km`)

  // 4) Projekt upserten (Format wie die Demos).
  const routes = [
    {
      id: ROUTE_ID,
      name: "Hinfahrt",
      fileName: "cuxhaven-werne.gpx",
      points,
      farbe: "#527121",
    },
  ]
  await db.query(
    `INSERT INTO projects (id, name, status, tenant_id, routes, transport, zeitraum, created_by)
     VALUES ($1, $2, 'entwurf', $3, $4, $5, $6, 'admin@setreo.de')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tenant_id = EXCLUDED.tenant_id,
       routes = EXCLUDED.routes, transport = EXCLUDED.transport, zeitraum = EXCLUDED.zeitraum,
       updated_at = now()`,
    [
      PROJECT_ID,
      "Schwertransport Cuxhaven → Werne (Bleckmannshof)",
      tenant.id,
      JSON.stringify(routes),
      JSON.stringify(TRANSPORT),
      JSON.stringify(ZEITRAUM),
    ],
  )
  log("Projekt upserted:", PROJECT_ID)

  // 5) Auswerten (setzt Funde + Status fertig + Distanz). Korridor wie in Prod.
  const corridorM = Number(process.env.CORRIDOR_M ?? 20)
  const result = await runAnalysis({
    db,
    project: { id: PROJECT_ID, routes, transport: TRANSPORT, zeitraum: ZEITRAUM },
    corridorM,
  })
  log(
    `Auswertung fertig: ${result.findings.length} Funde ` +
      `(${result.stats.kritisch} kritisch, ${result.stats.warnung} warnung, ${result.stats.hinweis} hinweis), ` +
      `${result.distanzKm} km, Korridor ${corridorM} m`,
  )
  log("DONE")
}

try {
  await main()
} catch (err) {
  console.error("[enercon-route] FEHLER:", err?.stack || err?.message || err)
  process.exitCode = 1
} finally {
  await pool.end()
}
