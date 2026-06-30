// API-Kerntests v2: supertest gegen app.js mit injiziertem Fake-db.
// Kein Netz: fetchImpl wird gemockt. Tenant-/Share-Suiten: tenants.test.js, share.test.js.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { totalKm } from "../src/engine/geometry.js"
import { buildFachId, todayIso } from "../src/obstaclesRepo.js"
import {
  cityPoints, createProject, createRoutedProject, jsonResponse, makeApp, midOf,
} from "./helpers/testApp.js"

const round1 = (n) => Math.round(n * 10) / 10

describe("health", () => {
  it("ist ungated und meldet db-Status", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, db: true })
    expect(res.body.version).toBeTruthy()
  })

  it("prüft OSRM mit, Gesamtstatus bleibt an db (degraded, T-471)", async () => {
    const { app } = makeApp({ requireAuth: true }) // offlineFetch → OSRM-Ping schlägt fehl
    const res = await request(app).get("/api/health")
    expect(res.status).toBe(200) // db ok → 200, trotz OSRM down
    expect(res.body.osrm).toBe(false)
    expect(res.body.degraded).toBe(true)
  })

  it("echot X-Request-Id als X-Trace-Id (T-468)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/health").set("X-Request-Id", "trace-abc-123")
    expect(res.headers["x-trace-id"]).toBe("trace-abc-123")
  })

  it("meldet worker:stale bei altem Heartbeat, bleibt aber 200 (T-469)", async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3h alt
    const db = {
      query: async (sql) =>
        sql.includes("worker_heartbeat") ? { rows: [{ last_beat: old }] } : { rows: [{ "?column?": 1 }] },
      tx: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    }
    const app = createApp({
      db,
      requireAuth: false,
      fetchImpl: async () => {
        throw new Error("offline")
      },
      sessionSalt: "x",
      shareBaseUrl: "https://setreo-cloud.com",
    })
    const res = await request(app).get("/api/health")
    expect(res.status).toBe(200) // toter Worker markiert die API NICHT als down
    expect(res.body.worker).toBe("stale")
  })
})

describe("Pool-Erschöpfung → 503 (T-389)", () => {
  it("DB-Connect-Timeout wird 503 + Retry-After statt 500", async () => {
    const boom = () => {
      throw new Error("timeout exceeded when trying to connect")
    }
    const throwingDb = { query: async () => boom(), tx: async (fn) => fn({ query: async () => boom() }) }
    const app = createApp({
      db: throwingDb,
      requireAuth: false,
      fetchImpl: async () => {
        throw new Error("offline")
      },
      sessionSalt: "x",
      shareBaseUrl: "https://setreo-cloud.com",
    })
    const res = await request(app).get("/api/context")
    expect(res.status).toBe(503)
    expect(res.headers["retry-after"]).toBe("5")
  })
})

describe("auth (Gateway-Modus)", () => {
  it("REQUIRE_AUTH: ohne X-Auth-User → 401", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/projects")
    expect(res.status).toBe(401)
  })

  it("Tenant-Mitglied: POST legt eigenen Eintrag an, global braucht admin/roadmap (v3)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const asMember = (req) => req.set("X-Auth-User", "vki@setreo.de").set("X-Auth-Roles", "user")

    expect((await asMember(request(app).get("/api/projects"))).status).toBe(200)
    expect((await asMember(request(app).get("/api/obstacles"))).status).toBe(200)

    // v3: Tenant-Nutzer dürfen eigene (tenant-gescopte) Einträge anlegen
    const own = await asMember(request(app).post("/api/obstacles")).send({
      kategorie: "ampel", name: "Eigene Ampel", lat: 50, lng: 8,
    })
    expect(own.status).toBe(201)
    expect(own.body.herkunft).toBe("eigen")

    // global anlegen bleibt admin/roadmap vorbehalten
    const denied = await asMember(request(app).post("/api/obstacles")).send({
      kategorie: "ampel", name: "Globale Ampel", lat: 50, lng: 8, global: true,
    })
    expect(denied.status).toBe(403)

    const allowed = await request(app)
      .post("/api/obstacles")
      .set("X-Auth-User", "max@setreo.de")
      .set("X-Auth-Roles", "roadmap")
      .send({ kategorie: "ampel", name: "Globale Ampel", lat: 50, lng: 8, global: true })
    expect(allowed.status).toBe(201)
    expect(allowed.body.herkunft).toBe("global")
  })

  it("Dev-Modus ohne Header → anonymer Admin auf Tenant setreo", async () => {
    const { app } = makeApp()
    const res = await request(app).post("/api/obstacles").send({
      kategorie: "ampel", name: "Dev-Ampel", lat: 50, lng: 8,
    })
    expect(res.status).toBe(201)
    const projects = await request(app).get("/api/projects")
    expect(projects.status).toBe(200)
  })
})

describe("context", () => {
  it("Mitglied: eigener Tenant, keine tenants-Liste", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app)
      .get("/api/context")
      .set("X-Auth-User", "VKI@setreo.de") // case-insensitive Mapping
      .set("X-Auth-Roles", "user")
    expect(res.status).toBe(200)
    expect(res.body.email).toBe("vki@setreo.de")
    expect(res.body.isAdmin).toBe(false)
    expect(res.body.tenant).toMatchObject({ slug: "setreo", name: "Setreo" })
    expect(res.body.tenants).toBeUndefined()
  })

  it("Admin: isAdmin + volle tenants-Liste (Switcher)", async () => {
    const { app } = makeApp()
    const res = await request(app).get("/api/context")
    expect(res.body.isAdmin).toBe(true)
    expect(res.body.tenant.slug).toBe("setreo")
    expect(res.body.tenants).toHaveLength(1)
    expect(res.body.tenants[0]).toMatchObject({
      slug: "setreo", name: "Setreo",
      mitglieder: [{ email: "vki@setreo.de", role: "user" }], projekte: 0,
    })
  })

  it("Externer ohne Mandanten-Zuordnung: tenant null, projects → 403 kein-mandant", async () => {
    const { app } = makeApp({ requireAuth: true })
    const asGhost = (req) =>
      req.set("X-Auth-User", "ghost@nirgendwo.de").set("X-Auth-Roles", "user").set("X-Auth-Gateway", "extern")
    const ctx = await asGhost(request(app).get("/api/context"))
    expect(ctx.status).toBe(200)
    expect(ctx.body.tenant).toBeNull()

    for (const path of ["/api/projects", "/api/findings", "/api/stats"]) {
      const res = await asGhost(request(app).get(path))
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: "kein-mandant" })
    }
  })

  it("Interner SSO-Nutzer ohne tenant_members-Zeile → automatisch Mandant setreo", async () => {
    const { app } = makeApp({ requireAuth: true })
    // gateway default "intern" (kein X-Auth-Gateway), keine Mitgliedschaft, Rolle user
    const asIntern = (req) => req.set("X-Auth-User", "neu@setreo.de").set("X-Auth-Roles", "user")
    const ctx = await asIntern(request(app).get("/api/context"))
    expect(ctx.status).toBe(200)
    expect(ctx.body.isAdmin).toBe(false)
    expect(ctx.body.tenant).toMatchObject({ slug: "setreo", name: "Setreo" })
    // und die tenant-pflichtigen Routen sind damit offen
    expect((await asIntern(request(app).get("/api/projects"))).status).toBe(200)
  })
})

describe("projects CRUD (v2-Shape)", () => {
  it("POST legt Projekt mit v2-Defaults an (camelCase-Contract)", async () => {
    const { app, tenant } = makeApp()
    const p = await createProject(app, "Neues Projekt")
    expect(p.status).toBe("entwurf")
    expect(p.tenantId).toBe(tenant.id)
    expect(p.routes).toEqual([])
    expect(p.transport).toEqual({
      laenge: 24.5, breite: 3.0, hoehe: 4.2, gesamtgewicht: 68,
      achsen: 8, achslasten: [11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5],
    })
    expect(p.zeitraum).toEqual({})
    expect(p.findings).toEqual([])
    expect(p.share).toBeNull()
    expect(p.createdAt).toBeTruthy()
    expect(p.distanzKm).toBeUndefined()
    // v1-Felder sind weg
    expect(p.route).toBeUndefined()
    expect(p.routeGeometry).toBeUndefined()
  })

  it("POST ohne name → 400", async () => {
    const { app } = makeApp()
    expect((await request(app).post("/api/projects").send({})).status).toBe(400)
    expect((await request(app).post("/api/projects").send({ name: "  " })).status).toBe(400)
  })

  it("GET /:id → 404 bei unbekannter/ungültiger id", async () => {
    const { app } = makeApp()
    expect((await request(app).get("/api/projects/3f6f5f6e-0000-4000-8000-000000000000")).status).toBe(404)
    expect((await request(app).get("/api/projects/keine-uuid")).status).toBe(404)
  })

  it("PATCH: transport/zeitraum Merge-Patch, routes ersetzt das ganze Array", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const points = cityPoints("Hamburg", "Hannover")
    const first = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-1", name: "Hinfahrt", fileName: "hin.gpx", points }],
      transport: { hoehe: 4.8, achslasten: [12, 12, 12] },
      zeitraum: { von: "2026-07-01T22:00" },
    })
    expect(first.status).toBe(200)
    expect(first.body.routes).toHaveLength(1)
    expect(first.body.routes[0]).toMatchObject({
      id: "r-1", name: "Hinfahrt", fileName: "hin.gpx", farbe: "#87B52D",
    })
    expect(first.body.routes[0].points).toEqual(points)
    expect(first.body.transport.hoehe).toBe(4.8)
    expect(first.body.transport.achslasten).toEqual([12, 12, 12]) // Array wird ersetzt
    expect(first.body.transport.laenge).toBe(24.5) // unangetastete Felder bleiben
    expect(first.body.zeitraum.von).toBe("2026-07-01T22:00")

    // routes erneut patchen → komplettes Ersetzen, nicht mergen
    const second = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-2", name: "Rückfahrt", points, farbe: "#3D5A80" }],
    })
    expect(second.body.routes).toHaveLength(1)
    expect(second.body.routes[0].id).toBe("r-2")
    expect(second.body.routes[0].farbe).toBe("#3D5A80")
  })

  it("PATCH: exakte Start/Ziel-Wegpunkte werden statisch persistiert, nicht downgesampelt (T-582)", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const points = cityPoints("Hamburg", "Hannover")
    const waypoints = [{ lat: 53.5511, lng: 9.9937 }, { lat: 52.3759, lng: 9.732 }] // exakte Pins
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-1", name: "Start/Ziel", points, source: "startziel", waypoints }],
    })
    expect(res.status).toBe(200)
    // Genau die gesetzten Pins bleiben erhalten (Editor zeigt sie akkurat).
    expect(res.body.routes[0].waypoints).toEqual(waypoints)
    // <2 valide Wegpunkte → Feld wird weggelassen (Datei-Upload ohne Pins).
    const ohne = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-1", name: "Datei", points, waypoints: [{ lat: 999, lng: 999 }] }],
    })
    expect(ohne.body.routes[0].waypoints).toBeUndefined()
  })

  it("T-603: PATCH entfernt eine Route → deren Funde werden gepurged (kein Geister-Snapshot)", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app)
    const points = cityPoints("Hamburg", "Hannover")
    await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-1", name: "A", points }, { id: "r-2", name: "B", points }],
    })
    // Funde auf beiden Routen direkt seeden (ohne Analyse).
    db.state.findings.push(
      { id: "f1", project_id: p.id, route_id: "r-1", kategorie: "bruecke", severity: "warnung", km: 1 },
      { id: "f2", project_id: p.id, route_id: "r-2", kategorie: "bruecke", severity: "warnung", km: 2 },
    )
    // r-2 entfernen → f2 muss verschwinden, f1 bleibt.
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ id: "r-1", name: "A", points }],
    })
    expect(res.status).toBe(200)
    expect(db.state.findings.map((f) => f.id)).toEqual(["f1"])
    // Alle Routen entfernen → kein Fund bleibt (Voll-Orphan kann nicht entstehen).
    await request(app).patch(`/api/projects/${p.id}`).send({ routes: [] })
    expect(db.state.findings.filter((f) => f.project_id === p.id)).toHaveLength(0)
  })

  it("PATCH vergibt Defaults für fehlende Routen-Felder", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [{ points: cityPoints("Köln", "Bonn") }],
    })
    expect(res.status).toBe(200)
    const route = res.body.routes[0]
    expect(route.id).toBeTruthy()
    expect(route.name).toBe("Strecke 1")
    expect(route.farbe).toBe("#87B52D")
    expect(route.fileName).toBeUndefined()
  })

  it("PATCH mit kaputten Shapes → 400", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ transport: "kaputt" })).status).toBe(400)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ routes: "kaputt" })).status).toBe(400)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ routes: [{ points: "x" }] })).status).toBe(400)
  })

  it("DELETE → 204, danach 404", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    expect((await request(app).delete(`/api/projects/${p.id}`)).status).toBe(204)
    expect((await request(app).delete(`/api/projects/${p.id}`)).status).toBe(404)
  })

  it("GET / listet mit eingebetteten findings + share, updatedAt desc", async () => {
    const { app } = makeApp()
    await createProject(app, "A")
    await createProject(app, "B")
    const res = await request(app).get("/api/projects")
    expect(res.status).toBe(200)
    expect(res.body.projects).toHaveLength(2)
    expect(Array.isArray(res.body.projects[0].findings)).toBe(true)
    expect(res.body.projects[0].share).toBeNull()
  })
})

describe("analysis (multi-route, offline)", () => {
  const HIN = cityPoints("Hamburg", "München")
  const RUECK = cityPoints("München", "Hamburg")

  async function setupTwoRoutes(app) {
    const p = await createProject(app, "Trafo HH ⇄ M")
    await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [
        { id: "r-hin", name: "Hinfahrt", points: HIN },
        { id: "r-rueck", name: "Rückfahrt", points: RUECK, farbe: "#3D5A80" },
      ],
      zeitraum: { von: "2026-07-01T22:00", bis: "2026-07-03T14:00" },
    })
    // je ein Hindernis exakt auf einer der beiden Strecken
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Brücke Hinfahrt", lat: midOf(HIN).lat, lng: midOf(HIN).lng,
      attrs: { maxHoeheM: 3.8 }, strassenRef: "A7 km 300,0",
    })
    const r2 = midOf(RUECK.slice(0, Math.floor(RUECK.length / 3)))
    await request(app).post("/api/obstacles").send({
      kategorie: "engstelle", name: "Engstelle Rückfahrt", lat: r2.lat, lng: r2.lng,
      attrs: { maxBreiteM: 3.05 },
    })
    // weit entferntes Hindernis darf NICHT matchen
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Fernbrücke", lat: midOf(HIN).lat + 1, lng: midOf(HIN).lng + 1,
      attrs: { maxHoeheM: 3.0 },
    })
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(200)
    return res.body
  }

  it("Funde tragen routeId/routeName, km auf der eigenen Route, distanz = Summe", async () => {
    const { app } = makeApp()
    const project = await setupTwoRoutes(app)

    expect(project.status).toBe("fertig")
    expect(project.distanzKm).toBe(round1(totalKm(HIN) + totalKm(RUECK)))
    expect(project.findings).toHaveLength(2) // Fernbrücke ausgefiltert

    const hin = project.findings.find((f) => f.titel === "Brücke Hinfahrt")
    expect(hin).toMatchObject({ routeId: "r-hin", routeName: "Hinfahrt", severity: "kritisch" })
    expect(hin.detail["Spielraum"]).toBe("−0,40 m")
    expect(hin.km).toBeGreaterThan(0)
    expect(hin.km).toBeLessThanOrEqual(round1(totalKm(HIN)))

    const rueck = project.findings.find((f) => f.titel === "Engstelle Rückfahrt")
    expect(rueck).toMatchObject({ routeId: "r-rueck", routeName: "Rückfahrt" })
    expect(rueck.km).toBeLessThanOrEqual(round1(totalKm(RUECK)))

    // reine Fahrzeit-Schätzung über die Strecke (≈50 km/h), KEIN Zuschlag je Fund
    expect(project.fahrzeitMin).toBe(Math.round((project.distanzKm / 50) * 60))
  })

  it("schreibt analysis_run mit stats.routen", async () => {
    const { app, db } = makeApp()
    await setupTwoRoutes(app)
    expect(db.state.runs).toHaveLength(1)
    const run = db.state.runs[0]
    expect(run.status).toBe("done")
    expect(run.provider).toMatchObject({ router: "upload", fallback: false })
    expect(run.stats).toMatchObject({ findings: 2, routen: 2 })
  })

  it("Re-Analyse ersetzt Findings statt sie zu doppeln", async () => {
    const { app, db } = makeApp()
    const project = await setupTwoRoutes(app)
    const again = await request(app).post(`/api/projects/${project.id}/analysis`)
    expect(again.status).toBe(200)
    expect(again.body.findings).toHaveLength(2)
    expect(db.state.findings).toHaveLength(2)
  })

  it("T-621: Fund auf zwei Strecken trägt BEIDE routeIds (Cross-Routen-Konsistenz, einmal)", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app, "Zwei Wege, eine Baustelle")
    // zwei Strecken auf demselben Weg → eine Baustelle in der Mitte liegt auf BEIDEN
    await request(app).patch(`/api/projects/${p.id}`).send({
      routes: [
        { id: "r-a", name: "Strecke A", points: cityPoints("Hamburg", "München") },
        { id: "r-b", name: "Strecke B", points: cityPoints("Hamburg", "München"), farbe: "#3D5A80" },
      ],
    })
    const mid = midOf(cityPoints("Hamburg", "München"))
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Brücke Mitte", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 }, strassenRef: "A7 km 300,0",
    })
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(200)
    // EINMAL angezeigt (Dedup greift), aber beide Strecken zugeordnet → bleibt sichtbar, egal welche an ist
    expect(res.body.findings).toHaveLength(1)
    const f = res.body.findings[0]
    expect(f.routeIds).toEqual(expect.arrayContaining(["r-a", "r-b"]))
    expect(f.routeIds).toHaveLength(2)
    // persistiert (route_ids-Spalte) — der überlebende Fund kennt beide Routen
    expect(db.state.findings[0].route_ids).toEqual(expect.arrayContaining(["r-a", "r-b"]))
  })

  it("keine Route mit Punkten → 422, Projekt bleibt unverändert", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app)
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(422)
    expect((await request(app).get(`/api/projects/${p.id}`)).body.status).toBe("entwurf")
    expect(db.state.runs[0].status).toBe("error")
  })
})

describe("viewer-routes — Strecken-Sichtbarkeit pro Account (T-622)", () => {
  it("PUT speichert + GET liefert die ausgeblendeten Strecken (sanitisiert); Default leer", async () => {
    const { app, db } = makeApp()
    const p = await createRoutedProject(app, { points: cityPoints("Hamburg", "Hannover") })
    const g0 = await request(app).get(`/api/projects/${p.id}/viewer-routes`)
    expect(g0.status).toBe(200)
    expect(g0.body.hiddenRouteIds).toEqual([]) // nichts gespeichert → alles sichtbar
    const put = await request(app)
      .put(`/api/projects/${p.id}/viewer-routes`)
      .send({ hiddenRouteIds: ["r-1", "r-1", 42, ""] }) // Dubletten/Nicht-Strings werden gefiltert
    expect(put.status).toBe(200)
    const g1 = await request(app).get(`/api/projects/${p.id}/viewer-routes`)
    expect(g1.body.hiddenRouteIds).toEqual(["r-1"])
    // pro Account gekeyt (email aus req.ctx, nie aus dem Body) — Dev-Account dev@local
    expect(db.state.viewerRoutePrefs).toHaveLength(1)
    expect(db.state.viewerRoutePrefs[0]).toMatchObject({ email: "dev@local", hidden_route_ids: ["r-1"] })
  })

  it("PUT ist voller Set-Ersatz (leeres Array blendet wieder alles ein)", async () => {
    const { app } = makeApp()
    const p = await createRoutedProject(app, { points: cityPoints("Hamburg", "Hannover") })
    await request(app).put(`/api/projects/${p.id}/viewer-routes`).send({ hiddenRouteIds: ["r-1"] })
    await request(app).put(`/api/projects/${p.id}/viewer-routes`).send({ hiddenRouteIds: [] })
    expect((await request(app).get(`/api/projects/${p.id}/viewer-routes`)).body.hiddenRouteIds).toEqual([])
  })

  it("fremdes/unbekanntes Projekt → 404 (Mandanten-Gate via loadProjectRow)", async () => {
    const { app } = makeApp()
    const fake = "00000000-0000-0000-0000-000000000000"
    expect((await request(app).get(`/api/projects/${fake}/viewer-routes`)).status).toBe(404)
    expect(
      (await request(app).put(`/api/projects/${fake}/viewer-routes`).send({ hiddenRouteIds: [] })).status,
    ).toBe(404)
  })
})

describe("findings-Suche", () => {
  it("filtert nach severity/kategorie/q und liefert projektName + routeId", async () => {
    const { app } = makeApp()
    const points = cityPoints("Hamburg", "München")
    const p = await createRoutedProject(app, { name: "Suchprojekt", points })
    const mid = midOf(points)
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Suchbrücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 },
    })
    await request(app).post(`/api/projects/${p.id}/analysis`)

    const all = await request(app).get("/api/findings")
    expect(all.body.findings).toHaveLength(1)
    expect(all.body.findings[0].projektName).toBe("Suchprojekt")
    expect(all.body.findings[0].projektId).toBe(p.id)
    expect(all.body.findings[0].routeId).toBe("r-1")
    expect(all.body.findings[0].routeName).toBe("Hinfahrt")

    expect((await request(app).get("/api/findings?severity=hinweis")).body.findings).toHaveLength(0)
    expect((await request(app).get("/api/findings?kategorie=bruecke")).body.findings).toHaveLength(1)
    expect((await request(app).get("/api/findings?q=suchbrücke")).body.findings).toHaveLength(1)
    expect((await request(app).get("/api/findings?q=nixda")).body.findings).toHaveLength(0)
  })
})

describe("obstacles CRUD + Import (v2-Felder)", () => {
  it("POST validiert kategorie und lat/lng", async () => {
    const { app } = makeApp()
    expect((await request(app).post("/api/obstacles").send({ kategorie: "ufo", lat: 1, lng: 2 })).status).toBe(400)
    expect((await request(app).post("/api/obstacles").send({ kategorie: "ampel", lat: "x", lng: 2 })).status).toBe(400)
  })

  it("fachId/quellenId/realerStart: explizit = passthrough, sonst v3-Defaults (0100 + auto)", async () => {
    const { app } = makeApp()
    const created = await request(app).post("/api/obstacles").send({
      kategorie: "baustelle", name: "B-Mobilithek", lat: 50, lng: 8,
      attrs: { restbreiteM: 3.2 },
      fachId: "00010009010126", quellenId: "0009", realerStart: "2026-01-01",
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      fachId: "00010009010126", quellenId: "0009", realerStart: "2026-01-01",
    })

    // v3: ohne Angabe → Kunden-Quelle 0100, fachId auto, realerStart = heute
    const plain = await request(app).post("/api/obstacles").send({
      kategorie: "ampel", name: "Ampel Süd", lat: 50, lng: 8,
    })
    expect(plain.body.quellenId).toBe("0100")
    expect(plain.body.fachId).toBe(buildFachId(1, "0100", todayIso()))
    expect(plain.body.realerStart).toBe(todayIso())
    expect(plain.body.quelle).toEqual({ name: "Eigener Eintrag (Setreo)", eigen: true })

    const patched = await request(app)
      .patch(`/api/obstacles/${created.body.id}`)
      .send({ quellenId: "0011" })
    expect(patched.body.quellenId).toBe("0011")
    expect(patched.body.fachId).toBe("00010009010126") // Merge erhält Bestand
  })

  it("PATCH merged, DELETE → 204/404", async () => {
    const { app } = makeApp()
    const created = await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Brücke B1", lat: 50, lng: 8, attrs: { maxHoeheM: 4.0 },
    })
    const id = created.body.id
    const patched = await request(app).patch(`/api/obstacles/${id}`).send({ attrs: { maxHoeheM: 4.5 }, aktiv: false })
    expect(patched.status).toBe(200)
    expect(patched.body.attrs.maxHoeheM).toBe(4.5)
    expect(patched.body.aktiv).toBe(false)
    expect(patched.body.name).toBe("Brücke B1")

    const aktive = await request(app).get("/api/obstacles?aktiv=true")
    expect(aktive.body.obstacles).toHaveLength(0)

    expect((await request(app).delete(`/api/obstacles/${id}`)).status).toBe(204)
    expect((await request(app).delete(`/api/obstacles/${id}`)).status).toBe(404)
  })

  it("Import: flache Liste mit Validierungs-Reasons", async () => {
    const { app } = makeApp()
    const res = await request(app).post("/api/obstacles/import").send({
      obstacles: [
        { kategorie: "bruecke", name: "OK", lat: 50, lng: 8, attrs: { maxHoeheM: 4.2 } },
        { kategorie: "ufo", lat: 50, lng: 8 },
        { kategorie: "ampel" },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.imported).toBe(1)
    expect(res.body.skipped).toBe(2)
    expect(res.body.reasons).toHaveLength(2)
    expect((await request(app).get("/api/obstacles")).body.obstacles).toHaveLength(1)
  })

  it("Import: GeoJSON-FeatureCollection (Punkte)", async () => {
    const { app } = makeApp()
    const res = await request(app).post("/api/obstacles/import").send({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [8.5, 50.1] },
          properties: { kategorie: "engstelle", name: "GeoJSON-Engstelle", attrs: { maxBreiteM: 3.2 } },
        },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[8, 50], [9, 51]] }, properties: {} },
      ],
    })
    expect(res.body.imported).toBe(1)
    expect(res.body.skipped).toBe(1)
    const list = await request(app).get("/api/obstacles")
    expect(list.body.obstacles[0]).toMatchObject({ kategorie: "engstelle", lat: 50.1, lng: 8.5 })
  })

  it("Import: weder Liste noch FeatureCollection → 400", async () => {
    const { app } = makeApp()
    expect((await request(app).post("/api/obstacles/import").send({ foo: 1 })).status).toBe(400)
  })
})

describe("geocode", () => {
  it("ohne q → 400", async () => {
    const { app } = makeApp()
    expect((await request(app).get("/api/geocode")).status).toBe(400)
  })

  it("offline → Städte-Tabelle (provider cities)", async () => {
    const { app } = makeApp()
    const res = await request(app).get("/api/geocode?q=Hamburg")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ provider: "cities" })
  })

  it("Nominatim-Treffer wird gecacht (zweiter Aufruf: provider cache)", async () => {
    // T-338: Nominatim ist nur mit konfigurierter (self-hosted) NOMINATIM_URL aktiv — für diesen
    // Test explizit setzen, sonst greift der Städte-Fallback statt des Geocoders.
    const prev = process.env.NOMINATIM_URL
    process.env.NOMINATIM_URL = "http://nominatim.test"
    try {
      const nominatimFetch = async (url) => {
        if (String(url).includes("/search?")) {
          return jsonResponse([{ lat: "53.55", lon: "9.99", display_name: "Hamburg, Deutschland" }])
        }
        throw new Error("offline")
      }
      const { app } = makeApp({ fetchImpl: nominatimFetch })
      const first = await request(app).get("/api/geocode?q=Hamburg")
      expect(first.body).toMatchObject({ provider: "nominatim", lat: 53.55, lng: 9.99 })

      const second = await request(app).get("/api/geocode?q=hamburg")
      expect(second.body.provider).toBe("cache")
    } finally {
      if (prev === undefined) delete process.env.NOMINATIM_URL
      else process.env.NOMINATIM_URL = prev
    }
  })
})

describe("stats", () => {
  it("aggregiert tenant-gescoped, Hindernisse sichtbarkeits-gescoped (global + eigen)", async () => {
    const { app } = makeApp()
    const points = cityPoints("Hamburg", "München")
    const p = await createRoutedProject(app, { name: "Statprojekt", points })
    const mid = midOf(points)
    // v3: POST ohne global → tenant-eigener Eintrag (setreo); demo wird erzwungen false
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Statbrücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 }, demo: true,
    })
    // plus ein globaler Demo-Eintrag (admin) — Demo-Daten sind immer global
    await request(app).post("/api/obstacles").send({
      kategorie: "engstelle", name: "Globale Engstelle", lat: 51, lng: 9,
      attrs: { maxBreiteM: 3.0 }, global: true, demo: true,
    })
    await request(app).post(`/api/projects/${p.id}/analysis`)

    const res = await request(app).get("/api/stats")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      projekte: 1, fertig: 1, funde: 1, kritisch: 1, warnung: 0, hinweis: 0,
      hindernisse: 2, hindernisseDemo: 1,
    })
    expect(res.body.letzteAnalyse).toBeTruthy()

    // anderer Tenant: leeres Dashboard, NUR der globale Eintrag zählt (kein Leak)
    await request(app).post("/api/admin/tenants").send({ slug: "kunde-a", name: "Kunde A" })
    const other = await request(app).get("/api/stats").set("X-Tenant", "kunde-a")
    expect(other.body).toMatchObject({ projekte: 0, funde: 0, hindernisse: 1, hindernisseDemo: 1 })
    expect(other.body.letzteAnalyse).toBeNull()
  })
})
