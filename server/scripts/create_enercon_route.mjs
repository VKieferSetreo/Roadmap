// Einmaliges, idempotentes Anlegen EINER Strecke auf dem Enercon-Mandanten.
//
// Nimmt die bestehende Demo-Strecke "Oberkirch → Karlsruhe" 1:1 (Routen-Geometrie
// verbatim aus der DB kopiert — KEIN Reroute) und legt sie unter fester Projekt-UUID
// auf dem Enercon-Mandanten an. Da dieselbe UUID wie zuvor (Cuxhaven→Werne) verwendet
// wird, ERSETZT der Upsert die alte Strecke (alte raus). Fahrtzeitraum 14.06.2026 ganztägig.
//
// Läuft im api-Container (hat DATABASE_URL):  node scripts/create_enercon_route.mjs
// Idempotent (feste Projekt-UUID, Upsert) → beliebig oft re-runbar.

import { createDb, createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"
import { runAnalysis } from "../src/engine/index.js"
import { getTenantBySlug } from "../src/tenants.js"

loadEnv()
const pool = createPool()
const db = createDb(pool)

const TENANT_SLUG = "enercon"
const PROJECT_ID = "cccccccc-0000-4000-8000-000000000001"

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

  // 2) Bestehende Oberkirch→Karlsruhe-Demo finden und ihre Routen 1:1 übernehmen.
  const { rows: src } = await db.query(
    `SELECT id, name, routes FROM projects
       WHERE name ILIKE '%oberkirch%' AND name ILIKE '%karlsruhe%' AND archived_at IS NULL
       ORDER BY created_at ASC LIMIT 1`,
  )
  if (!src[0]) throw new Error("Quell-Demo 'Oberkirch → Karlsruhe' nicht gefunden")
  const routes = src[0].routes // jsonb → bereits geparst, 1:1 übernehmen
  const ptCount = Array.isArray(routes) ? routes.reduce((n, r) => n + (r.points?.length ?? 0), 0) : 0
  log(`Quelle: "${src[0].name}" (${src[0].id}) — ${Array.isArray(routes) ? routes.length : 0} Route(n), ${ptCount} Punkte (1:1)`)

  // 3) Enercon-Projekt upserten (gleiche UUID → ersetzt die alte Cuxhaven→Werne-Strecke).
  await db.query(
    `INSERT INTO projects (id, name, status, tenant_id, routes, transport, zeitraum, created_by)
     VALUES ($1, $2, 'entwurf', $3, $4, $5, $6, 'admin@setreo.de')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tenant_id = EXCLUDED.tenant_id,
       routes = EXCLUDED.routes, transport = EXCLUDED.transport, zeitraum = EXCLUDED.zeitraum,
       updated_at = now()`,
    [
      PROJECT_ID,
      "Schwertransport Oberkirch → Karlsruhe",
      tenant.id,
      JSON.stringify(routes),
      JSON.stringify(TRANSPORT),
      JSON.stringify(ZEITRAUM),
    ],
  )
  log("Projekt upserted:", PROJECT_ID, "(ersetzt Cuxhaven→Werne)")

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
