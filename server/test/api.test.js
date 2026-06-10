// API-Tests: supertest gegen app.js mit injiziertem Fake-db.
// Kein Netz: fetchImpl wird gemockt (offline → Fallback bzw. Provider-JSON).

import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { CITY_COORDS, resolveOrt } from "../src/engine/cities.js"
import { buildPolyline } from "../src/engine/fallback.js"
import { createFakeDb } from "./helpers/fakeDb.js"

/** fetch-Mock: alles offline → Provider-Fallbacks greifen. */
const offlineFetch = async () => {
  throw new Error("offline")
}

const jsonResponse = (payload) => ({ ok: true, json: async () => payload })

function makeApp(overrides = {}) {
  const db = createFakeDb()
  const app = createApp({ db, fetchImpl: offlineFetch, requireAuth: false, ...overrides })
  return { db, app }
}

async function createProject(app, name = "Testprojekt") {
  const res = await request(app).post("/api/projects").send({ name })
  expect(res.status).toBe(201)
  return res.body
}

describe("health", () => {
  it("ist ungated und meldet db-Status", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, db: true })
    expect(res.body.version).toBeTruthy()
  })
})

describe("auth (Gateway-Modus)", () => {
  it("REQUIRE_AUTH: ohne X-Auth-User → 401", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/projects")
    expect(res.status).toBe(401)
  })

  it("Lesen mit beliebiger Rolle ok, Schreiben auf obstacles braucht admin/roadmap", async () => {
    const { app } = makeApp({ requireAuth: true })
    const asUser = (req) => req.set("X-Auth-User", "max@setreo.de").set("X-Auth-Roles", "user")

    expect((await asUser(request(app).get("/api/obstacles"))).status).toBe(200)
    const denied = await asUser(request(app).post("/api/obstacles")).send({
      kategorie: "ampel", lat: 50, lng: 8,
    })
    expect(denied.status).toBe(403)

    const allowed = await request(app)
      .post("/api/obstacles")
      .set("X-Auth-User", "max@setreo.de")
      .set("X-Auth-Roles", "roadmap")
      .send({ kategorie: "ampel", lat: 50, lng: 8 })
    expect(allowed.status).toBe(201)
  })

  it("Dev-Modus ohne Header → anonymer Dev-User darf schreiben", async () => {
    const { app } = makeApp()
    const res = await request(app).post("/api/obstacles").send({ kategorie: "ampel", lat: 50, lng: 8 })
    expect(res.status).toBe(201)
  })
})

describe("projects CRUD", () => {
  it("POST legt Projekt mit Defaults an (camelCase-Contract)", async () => {
    const { app } = makeApp()
    const p = await createProject(app, "Neues Projekt")
    expect(p.status).toBe("entwurf")
    expect(p.route).toEqual({ mode: "startziel", vias: [] })
    expect(p.transport.hoehe).toBe(4.2)
    expect(p.transport.fahrzeugTyp).toBe("Sattelzug mit Tieflader")
    expect(p.zeitraum).toEqual({})
    expect(p.routeGeometry).toEqual([])
    expect(p.findings).toEqual([])
    expect(p.createdAt).toBeTruthy()
    expect(p.distanzKm).toBeUndefined()
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

  it("PATCH macht Merge-Patch wie der FE-Store", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      route: { start: "Hamburg", ziel: "München" },
      transport: { hoehe: 4.8 },
      zeitraum: { von: "2026-07-01T22:00" },
    })
    expect(res.status).toBe(200)
    expect(res.body.route).toEqual({ mode: "startziel", vias: [], start: "Hamburg", ziel: "München" })
    expect(res.body.transport.hoehe).toBe(4.8)
    expect(res.body.transport.laenge).toBe(24.5) // unangetastete Felder bleiben
    expect(res.body.zeitraum.von).toBe("2026-07-01T22:00")
  })

  it("PATCH mit Nicht-Objekt → 400", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).patch(`/api/projects/${p.id}`).send({ transport: "kaputt" })
    expect(res.status).toBe(400)
  })

  it("DELETE → 204, danach 404", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    expect((await request(app).delete(`/api/projects/${p.id}`)).status).toBe(204)
    expect((await request(app).delete(`/api/projects/${p.id}`)).status).toBe(404)
  })

  it("GET / listet mit eingebetteten findings, updatedAt desc", async () => {
    const { app } = makeApp()
    await createProject(app, "A")
    await createProject(app, "B")
    const res = await request(app).get("/api/projects")
    expect(res.status).toBe(200)
    expect(res.body.projects).toHaveLength(2)
    expect(Array.isArray(res.body.projects[0].findings)).toBe(true)
  })
})

describe("analysis (offline → deterministische Fallbacks)", () => {
  async function setupAnalysed(app, db) {
    const p = await createProject(app, "Trafo HH → M")
    await request(app).patch(`/api/projects/${p.id}`).send({
      route: { start: "Hamburg", ziel: "München" },
      zeitraum: { von: "2026-07-01T22:00", bis: "2026-07-03T14:00" },
    })
    // Hindernis exakt auf der deterministischen Fallback-Route platzieren
    const geometry = buildPolyline([resolveOrt("Hamburg"), resolveOrt("München")])
    const mid = geometry[Math.floor(geometry.length / 2)]
    const obstacle = await request(app).post("/api/obstacles").send({
      kategorie: "bruecke",
      name: "Testbrücke",
      lat: mid.lat,
      lng: mid.lng,
      attrs: { maxHoeheM: 3.8 },
      strassenRef: "A7 km 300,0",
    })
    expect(obstacle.status).toBe(201)
    // weit entferntes Hindernis darf NICHT matchen
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Fernbrücke", lat: mid.lat + 1, lng: mid.lng + 1,
      attrs: { maxHoeheM: 3.0 },
    })
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(200)
    return { project: res.body, db }
  }

  it("liefert fertiges Projekt mit Findings aus dem Korridor-Matching", async () => {
    const { app, db } = makeApp()
    const { project } = await setupAnalysed(app, db)

    expect(project.status).toBe("fertig")
    expect(project.routeGeometry.length).toBeGreaterThan(10)
    expect(project.distanzKm).toBeGreaterThan(500)

    expect(project.findings).toHaveLength(1) // Fernbrücke ausgefiltert
    const f = project.findings[0]
    expect(f.kategorie).toBe("bruecke")
    expect(f.titel).toBe("Testbrücke")
    expect(f.severity).toBe("kritisch") // 3,80 m vs 4,20 m Default-Höhe
    expect(f.detail["Spielraum"]).toBe("−0,40 m")
    expect(f.km).toBeGreaterThan(0)
    expect(f.strassenRef).toBe("A7 km 300,0")

    // deterministische Fahrzeit-Formel: km/55·60 + 25·kritisch + 10·warnung
    expect(project.fahrzeitMin).toBe(Math.round((project.distanzKm / 55) * 60 + 25))
  })

  it("schreibt analysis_run mit Provider-Flags (fallback)", async () => {
    const { app, db } = makeApp()
    await setupAnalysed(app, db)
    expect(db.state.runs).toHaveLength(1)
    const run = db.state.runs[0]
    expect(run.status).toBe("done")
    expect(run.provider).toMatchObject({ geocoder: "cities", router: "fallback", fallback: true })
    expect(run.stats.findings).toBe(1)
  })

  it("Re-Analyse ersetzt Findings statt sie zu doppeln", async () => {
    const { app, db } = makeApp()
    const { project } = await setupAnalysed(app, db)
    const again = await request(app).post(`/api/projects/${project.id}/analysis`)
    expect(again.status).toBe(200)
    expect(again.body.findings).toHaveLength(1)
    expect(db.state.findings).toHaveLength(1)
  })

  it("upload-Modus mit points nutzt die Punkte direkt", async () => {
    const { app } = makeApp()
    const p = await createProject(app, "Upload")
    const points = [
      { lat: 50.0, lng: 8.0 }, { lat: 50.2, lng: 8.4 }, { lat: 50.4, lng: 8.8 },
    ]
    await request(app).patch(`/api/projects/${p.id}`).send({
      route: { mode: "upload", fileName: "strecke.gpx", points },
    })
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(200)
    expect(res.body.routeGeometry).toEqual(points)
  })

  it("startziel ohne Start/Ziel → 400", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(400)
  })

  it("OSRM erreichbar → echte Geometrie + route_cache (zweiter Lauf: cache)", async () => {
    const osrmFetch = async (url) => {
      if (String(url).includes("/route/v1/driving/")) {
        return jsonResponse({
          code: "Ok",
          routes: [{
            geometry: { coordinates: [[9.9937, 53.5511], [10.5, 51.0], [11.582, 48.1351]] },
            distance: 765000,
            duration: 28000,
          }],
        })
      }
      throw new Error("offline") // Nominatim down → Städte-Tabelle
    }
    const { app, db } = makeApp({ fetchImpl: osrmFetch })
    const p = await createProject(app, "OSRM-Projekt")
    await request(app).patch(`/api/projects/${p.id}`).send({
      route: { start: "Hamburg", ziel: "München" },
    })
    const res = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(res.status).toBe(200)
    expect(res.body.distanzKm).toBe(765)
    expect(res.body.routeGeometry).toHaveLength(3)
    expect(db.state.runs[0].provider.router).toBe("osrm")

    await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(db.state.runs[1].provider.router).toBe("cache")
  })
})

describe("findings-Suche", () => {
  it("filtert nach severity/kategorie/q und liefert projektName", async () => {
    const { app } = makeApp()
    const p = await createProject(app, "Suchprojekt")
    await request(app).patch(`/api/projects/${p.id}`).send({
      route: { start: "Hamburg", ziel: "München" },
    })
    const geometry = buildPolyline([resolveOrt("Hamburg"), resolveOrt("München")])
    const mid = geometry[Math.floor(geometry.length / 2)]
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Suchbrücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 },
    })
    await request(app).post(`/api/projects/${p.id}/analysis`)

    const all = await request(app).get("/api/findings")
    expect(all.body.findings).toHaveLength(1)
    expect(all.body.findings[0].projektName).toBe("Suchprojekt")
    expect(all.body.findings[0].projektId).toBe(p.id)

    expect((await request(app).get("/api/findings?severity=hinweis")).body.findings).toHaveLength(0)
    expect((await request(app).get("/api/findings?kategorie=bruecke")).body.findings).toHaveLength(1)
    expect((await request(app).get("/api/findings?q=suchbrücke")).body.findings).toHaveLength(1)
    expect((await request(app).get("/api/findings?q=nixda")).body.findings).toHaveLength(0)
  })
})

describe("obstacles CRUD + Import", () => {
  it("POST validiert kategorie und lat/lng", async () => {
    const { app } = makeApp()
    expect((await request(app).post("/api/obstacles").send({ kategorie: "ufo", lat: 1, lng: 2 })).status).toBe(400)
    expect((await request(app).post("/api/obstacles").send({ kategorie: "ampel", lat: "x", lng: 2 })).status).toBe(400)
  })

  it("PATCH merged, DELETE → 204/404", async () => {
    const { app } = makeApp()
    const created = await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "B1", lat: 50, lng: 8, attrs: { maxHoeheM: 4.0 },
    })
    const id = created.body.id
    const patched = await request(app).patch(`/api/obstacles/${id}`).send({ attrs: { maxHoeheM: 4.5 }, aktiv: false })
    expect(patched.status).toBe(200)
    expect(patched.body.attrs.maxHoeheM).toBe(4.5)
    expect(patched.body.aktiv).toBe(false)
    expect(patched.body.name).toBe("B1")

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
    expect(res.body).toMatchObject({ provider: "cities", ...CITY_COORDS.hamburg })
  })

  it("Nominatim-Treffer wird gecacht (zweiter Aufruf: provider cache)", async () => {
    const nominatimFetch = async (url) => {
      if (String(url).includes("/search?")) {
        return jsonResponse([{ lat: "53.55", lon: "9.99", display_name: "Hamburg, Deutschland" }])
      }
      throw new Error("offline")
    }
    const { app } = makeApp({ fetchImpl: nominatimFetch })
    const first = await request(app).get("/api/geocode?q=Hamburg")
    expect(first.body).toMatchObject({ provider: "nominatim", lat: 53.55, lng: 9.99 })
    expect(first.body.displayName).toBe("Hamburg, Deutschland")

    const second = await request(app).get("/api/geocode?q=hamburg")
    expect(second.body.provider).toBe("cache")
  })
})

describe("stats", () => {
  it("aggregiert Projekte/Funde/Hindernisse/letzteAnalyse", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app, "Statprojekt")
    await request(app).patch(`/api/projects/${p.id}`).send({
      route: { start: "Hamburg", ziel: "München" },
    })
    const geometry = buildPolyline([resolveOrt("Hamburg"), resolveOrt("München")])
    const mid = geometry[Math.floor(geometry.length / 2)]
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Statbrücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 }, demo: true,
    })
    await request(app).post(`/api/projects/${p.id}/analysis`)

    const res = await request(app).get("/api/stats")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      projekte: 1, fertig: 1, funde: 1, kritisch: 1, warnung: 0, hinweis: 0,
      hindernisse: 1, hindernisseDemo: 1,
    })
    expect(res.body.letzteAnalyse).toBeTruthy()
    expect(db.state.runs[0].status).toBe("done")
  })
})
