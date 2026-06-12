// Import-Engine v3: runImport (Upsert/Dedupe/fachId/Fehlertoleranz),
// Autobahn-Referenz-Connector (fetch gemockt) und die Admin-Endpoints.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { autobahnConnector, normalizeRoadwork } from "../src/connectors/autobahn.js"
import { CONNECTORS, enabledConnectors, getConnector } from "../src/connectors/index.js"
import { buildFachId, todayIso } from "../src/obstaclesRepo.js"
import { runImport } from "../src/worker/importer.js"
import { createFakeDb } from "./helpers/fakeDb.js"
import { jsonResponse, makeApp } from "./helpers/testApp.js"

const quiet = () => {}

/** Mock-Connector mit austauschbaren Items (Quelle 0009 aus dem Register). */
const mockConnector = (items) => ({
  quelleId: "0009",
  name: "Mock-Quelle",
  schedule: "0 4 * * *",
  fetch: async () => ({ obstacles: items }),
})

const ITEM_A = {
  externeId: "ext-a",
  kategorie: "baustelle",
  name: "Baustelle A2",
  lat: 52.3,
  lng: 9.7,
  strassenRef: "A2",
  attrs: {},
  quelle: { name: "Mock", url: "https://example.org/a", aktualisiertAm: "2026-06-12T00:00:00Z" },
}
const ITEM_B = { ...ITEM_A, externeId: "ext-b", name: "Baustelle A7", strassenRef: "A7" }

describe("runImport (Mock-Connector)", () => {
  it("neu → INSERT mit fachId-Vergabe, global, demo=false; Run + letzter_abruf protokolliert", async () => {
    const db = createFakeDb()
    const run = await runImport({ db, connector: mockConnector([ITEM_A, ITEM_B]), log: quiet })

    expect(run.status).toBe("ok")
    expect(run.stats).toEqual({ gefunden: 2, neu: 2, aktualisiert: 0, uebersprungen: 0 })
    expect(run.finished_at).toBeTruthy()

    expect(db.state.obstacles).toHaveLength(2)
    const [a, b] = db.state.obstacles
    expect(a).toMatchObject({
      quellen_id: "0009", externe_id: "ext-a", tenant_id: null, demo: false, aktiv: true,
      fach_id: buildFachId(1, "0009", todayIso()), realer_start: todayIso(),
    })
    expect(b.fach_id).toBe(buildFachId(2, "0009", todayIso()))

    expect(db.state.importRuns).toHaveLength(1)
    expect(db.state.quellen.find((q) => q.id === "0009").letzter_abruf).toBeTruthy()
  })

  it("Re-Import: Sachfelder aktualisiert, fachId/realerStart stabil, kein Duplikat", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: mockConnector([ITEM_A]), log: quiet })
    const before = { ...db.state.obstacles[0] }

    const changed = { ...ITEM_A, name: "Baustelle A2 (verlängert)", lat: 52.31, gueltigBis: "2026-09-30" }
    const run = await runImport({ db, connector: mockConnector([changed, ITEM_B]), log: quiet })

    expect(run.stats).toEqual({ gefunden: 2, neu: 1, aktualisiert: 1, uebersprungen: 0 })
    expect(db.state.obstacles).toHaveLength(2)
    const updated = db.state.obstacles.find((o) => o.externe_id === "ext-a")
    expect(updated.name).toBe("Baustelle A2 (verlängert)")
    expect(updated.lat).toBe(52.31)
    expect(updated.gueltig_bis).toBe("2026-09-30")
    expect(updated.fach_id).toBe(before.fach_id) // stabil
    expect(updated.realer_start).toBe(before.realer_start) // stabil
    // fachId-Sequenz läuft über Runs weiter
    expect(db.state.obstacles.find((o) => o.externe_id === "ext-b").fach_id)
      .toBe(buildFachId(2, "0009", todayIso()))
  })

  it("Re-Import setzt manuelles aktiv=false NICHT zurück", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: mockConnector([ITEM_A]), log: quiet })
    db.state.obstacles[0].aktiv = false // Admin hat manuell deaktiviert
    await runImport({ db, connector: mockConnector([ITEM_A]), log: quiet })
    expect(db.state.obstacles[0].aktiv).toBe(false)
  })

  it("fehlerhafte Items werden übersprungen und geloggt, der Rest importiert", async () => {
    const db = createFakeDb()
    const run = await runImport({
      db,
      connector: mockConnector([
        ITEM_A,
        { ...ITEM_B, externeId: undefined }, // Dedupe-Anker fehlt
        { ...ITEM_B, externeId: "ext-c", kategorie: "ufo" }, // ungültige Kategorie
        { ...ITEM_B, externeId: "ext-d", lat: "kaputt" }, // lat keine Zahl
      ]),
      log: quiet,
    })
    expect(run.stats).toEqual({ gefunden: 4, neu: 1, aktualisiert: 0, uebersprungen: 3 })
    expect(run.log).toContain("externeId fehlt")
    expect(run.log).toContain("ungültige kategorie")
    expect(db.state.obstacles).toHaveLength(1)
  })

  it("Connector-Fehler → Run status error mit Log, runImport wirft nicht", async () => {
    const db = createFakeDb()
    const broken = {
      quelleId: "0009", name: "Kaputt", schedule: "* * * * *",
      fetch: async () => { throw new Error("API down") },
    }
    const run = await runImport({ db, connector: broken, log: quiet })
    expect(run.status).toBe("error")
    expect(run.log).toContain("API down")
    expect(run.stats).toEqual({ gefunden: 0, neu: 0, aktualisiert: 0, uebersprungen: 0 })
    expect(db.state.obstacles).toHaveLength(0)
    // auch Fehl-Runs aktualisieren letzter_abruf (Quelle wurde kontaktiert)
    expect(db.state.quellen.find((q) => q.id === "0009").letzter_abruf).toBeTruthy()
  })
})

const ROADWORK = {
  identifier: "RW-1",
  title: "A1 | AS Münster-Nord (73) - AS Greven (75)",
  subtitle: "Bauarbeiten",
  startTimestamp: "2026-03-08T14:36:25.000+0100",
  coordinate: { lat: "52.046542", long: "7.611449" },
  description: ["Beginn: 08.03.2026", "Fahrbahnverengung"],
}

describe("Autobahn-Connector (Quelle 0001, fetch gemockt)", () => {
  it("normalisiert Roadworks: identifier→externeId, String-Koordinaten, Zeitraum", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("/A1/services/roadworks")) {
        return jsonResponse({ roadworks: [ROADWORK, { identifier: "ohne-coords" }] })
      }
      throw new Error("offline") // alle anderen Roads: tolerant übersprungen
    }
    const { obstacles } = await autobahnConnector.fetch({
      fetchImpl, env: { AUTOBAHN_ROADS: "A1,A7" }, timeoutMs: 50, log: quiet,
    })
    expect(obstacles).toHaveLength(1) // ohne-coords verworfen, A7 offline toleriert
    expect(obstacles[0]).toMatchObject({
      externeId: "RW-1",
      kategorie: "baustelle",
      name: "A1 | AS Münster-Nord (73) - AS Greven (75)",
      lat: 52.046542,
      lng: 7.611449,
      strassenRef: "A1",
      gueltigVon: "2026-03-08",
      realerStart: "2026-03-08",
    })
    expect(obstacles[0].beschreibung).toBe("Bauarbeiten\nBeginn: 08.03.2026\nFahrbahnverengung")
    expect(obstacles[0].quelle.name).toBe("Autobahn-API · A1 Roadworks")
    expect(obstacles[0].quelle.url).toContain("/A1/services/roadworks")
  })

  it("normalizeRoadwork verwirft Items ohne identifier/Koordinaten", () => {
    expect(normalizeRoadwork({}, "A1", "u")).toBeNull()
    expect(normalizeRoadwork({ identifier: "x" }, "A1", "u")).toBeNull()
    expect(normalizeRoadwork({ identifier: "x", coordinate: { lat: "a", long: "b" } }, "A1", "u")).toBeNull()
  })

  it("Registry: Autobahn registriert, enabledConnectors folgt env CONNECTORS", () => {
    expect(getConnector("0001")).toBe(autobahnConnector)
    expect(getConnector("0002")).toBeNull()
    expect(CONNECTORS.map((c) => c.quelleId)).toContain("0001")
    expect(enabledConnectors({ CONNECTORS: "" })).toEqual([])
    expect(enabledConnectors({})).toEqual([])
    expect(enabledConnectors({ CONNECTORS: "0001, 9999" })).toEqual([autobahnConnector])
  })
})

describe("Admin-Endpoints (Import)", () => {
  const autobahnFetch = async (url) => {
    if (String(url).includes("/services/roadworks")) {
      return String(url).includes("/A1/")
        ? jsonResponse({ roadworks: [ROADWORK] })
        : jsonResponse({ roadworks: [] })
    }
    throw new Error("offline")
  }

  it("POST /api/admin/import/:quelleId triggert synchron → Run-Summary (camelCase)", async () => {
    const { app } = makeApp({ fetchImpl: autobahnFetch })
    const res = await request(app).post("/api/admin/import/0001")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      quelleId: "0001",
      status: "ok",
      stats: { gefunden: 1, neu: 1, aktualisiert: 0, uebersprungen: 0 },
    })
    expect(res.body.startedAt).toBeTruthy()
    expect(res.body.finishedAt).toBeTruthy()

    // importiertes Hindernis ist global sichtbar
    const list = await request(app).get("/api/obstacles")
    expect(list.body.obstacles).toHaveLength(1)
    expect(list.body.obstacles[0]).toMatchObject({ herkunft: "global", quellenId: "0001" })
  })

  it("ohne registrierten Connector → 404; non-admin → 403", async () => {
    const { app } = makeApp({ requireAuth: true })
    const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
    const asUser = (req) => req.set("X-Auth-User", "vki@setreo.de").set("X-Auth-Roles", "user")

    expect((await asAdmin(request(app).post("/api/admin/import/0002"))).status).toBe(404)
    expect((await asUser(request(app).post("/api/admin/import/0001"))).status).toBe(403)
    expect((await asUser(request(app).get("/api/admin/import-runs"))).status).toBe(403)
  })

  it("GET /api/admin/import-runs: letzte Runs + Quellen-Status mit connector-Flag", async () => {
    const { app } = makeApp({ fetchImpl: autobahnFetch })
    await request(app).post("/api/admin/import/0001")

    const res = await request(app).get("/api/admin/import-runs")
    expect(res.status).toBe(200)
    expect(res.body.runs).toHaveLength(1)
    expect(res.body.runs[0]).toMatchObject({ quelleId: "0001", status: "ok" })

    expect(res.body.quellen.map((q) => q.id)).toEqual(["0001", "0002", "0003", "0009", "0100"])
    const autobahn = res.body.quellen.find((q) => q.id === "0001")
    expect(autobahn.connector).toBe(true)
    expect(autobahn.letzterAbruf).toBeTruthy()
    expect(res.body.quellen.find((q) => q.id === "0002").connector).toBe(false)
  })
})
