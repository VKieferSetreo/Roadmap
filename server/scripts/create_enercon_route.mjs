// Einmaliges, idempotentes Anlegen EINER realen Strecke auf dem Enercon-Mandanten —
// im Format der übrigen Demo-Projekte (routes[]/transport/zeitraum), inkl. Auswertung.
//
// Strecke: Cuxhaven → Werne (NRW), ~293 km über reale Straßen (A27/A1/A1). Die Geometrie
// ist FEST eingebacken (vorab via OSRM geroutet) — NICHT zur Laufzeit aufgelöst: OSRM ist
// aus dem Container nicht erreichbar und der Fallback wäre Luftlinie. Fahrtzeitraum:
// 14.06.2026 ganztägig.
//
// Läuft im api-Container (hat DATABASE_URL):  node scripts/create_enercon_route.mjs
// Idempotent (feste Projekt-UUID, Upsert) → beliebig oft re-runbar.

import { createDb, createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"
import { downsample } from "../src/engine/fallback.js"
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

// Reale, vorab via OSRM geroutete Strecke Cuxhaven → Werne (293,4 km, [lat,lng]).
const ROUTE_LL = [
  [53.86879,8.69823],[53.86521,8.70093],[53.86322,8.70229],[53.85903,8.70588],[53.85638,8.70544],[53.85249,8.71277],[53.8501,8.71907],[53.84811,8.72567],[53.84536,8.72957],[53.84192,8.73377],[53.83649,8.7298],[53.81893,8.71003],[53.79311,8.7081],[53.76394,8.69347],[53.74338,8.66657],[53.72492,8.66191],[53.68021,8.65793],[53.6427,8.66309],[53.61938,8.66413],[53.59277,8.63898],[53.57676,8.62036],[53.54224,8.61956],[53.52517,8.62421],[53.50276,8.62846],[53.4817,8.61957],[53.46325,8.5994],[53.44391,8.58383],[53.44075,8.581],[53.43744,8.56889],[53.43452,8.54519],[53.43765,8.51693],[53.43433,8.44978],[53.43398,8.44261],[53.43059,8.44351],[53.41668,8.44976],[53.40737,8.44056],[53.40055,8.43771],[53.37769,8.44467],[53.36606,8.44809],[53.3518,8.44415],[53.33951,8.45101],[53.32767,8.44478],[53.32357,8.42059],[53.31583,8.4009],[53.30671,8.39758],[53.29288,8.3918],[53.288,8.37941],[53.27795,8.36478],[53.26834,8.35065],[53.26661,8.33563],[53.26462,8.31805],[53.25704,8.30499],[53.24631,8.29405],[53.23671,8.28059],[53.23117,8.26989],[53.22357,8.24645],[53.21478,8.22732],[53.21044,8.22122],[53.20351,8.23112],[53.19097,8.25362],[53.16941,8.26934],[53.13929,8.27615],[53.11644,8.27376],[53.09665,8.26543],[53.07111,8.24232],[53.04338,8.2206],[53.00317,8.20774],[52.96904,8.18478],[52.93301,8.1748],[52.9084,8.16437],[52.89589,8.16825],[52.88587,8.18443],[52.87086,8.21537],[52.85231,8.22577],[52.8105,8.20986],[52.77084,8.19205],[52.73807,8.1753],[52.70562,8.17305],[52.66215,8.16549],[52.62331,8.13571],[52.58449,8.10978],[52.53995,8.11341],[52.50997,8.09277],[52.47279,8.05577],[52.43058,8.03212],[52.41104,8.03178],[52.38699,8.04152],[52.3459,8.02538],[52.33774,8.01208],[52.32809,7.97802],[52.31263,7.95107],[52.29121,7.94046],[52.25725,7.91901],[52.23754,7.88553],[52.21736,7.86547],[52.20816,7.8304],[52.19737,7.80185],[52.16587,7.75465],[52.12538,7.71377],[52.10173,7.67921],[52.08179,7.64098],[52.05212,7.61512],[52.02918,7.60077],[52.01684,7.58859],[52.00704,7.57627],[51.98771,7.55798],[51.96769,7.5466],[51.94828,7.54811],[51.92124,7.55732],[51.90357,7.56667],[51.87873,7.57603],[51.84905,7.58069],[51.81178,7.62173],[51.78007,7.63919],[51.72859,7.65238],[51.69481,7.66783],[51.69493,7.66509],[51.68318,7.63431],[51.68152,7.63414],[51.67082,7.63607],[51.66365,7.63168],[51.6609,7.63056],[51.66106,7.63256],[51.66154,7.63466],[51.6625,7.63605],
]

const log = (...a) => console.log("[enercon-route]", ...a)

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

  // 2) Reale Geometrie (vorab geroutet) → Punkte.
  const points = downsample(ROUTE_LL.map(([lat, lng]) => ({ lat, lng })))
  log(`Route: ${points.length} Punkte (reale Straße), ~${Math.round(totalKm(points))} km`)

  // 3) Projekt upserten (Format wie die Demos).
  const routes = [
    { id: ROUTE_ID, name: "Hinfahrt", fileName: "cuxhaven-werne.gpx", points, farbe: "#527121" },
  ]
  await db.query(
    `INSERT INTO projects (id, name, status, tenant_id, routes, transport, zeitraum, created_by)
     VALUES ($1, $2, 'entwurf', $3, $4, $5, $6, 'admin@setreo.de')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tenant_id = EXCLUDED.tenant_id,
       routes = EXCLUDED.routes, transport = EXCLUDED.transport, zeitraum = EXCLUDED.zeitraum,
       updated_at = now()`,
    [
      PROJECT_ID,
      "Schwertransport Cuxhaven → Werne",
      tenant.id,
      JSON.stringify(routes),
      JSON.stringify(TRANSPORT),
      JSON.stringify(ZEITRAUM),
    ],
  )
  log("Projekt upserted:", PROJECT_ID)

  // 4) Auswerten (setzt Funde + Status fertig + Distanz). Korridor wie in Prod.
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
