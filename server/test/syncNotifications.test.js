// v3.1 — Sync-Engine ans FE: Vollbestand-Reconcile, Ablauf-Hygiene, Auto-Rerun
// mit Fund-Diff → Benachrichtigungen, Notifications-API und Sync-Job-Lifecycle.

import { randomUUID } from "node:crypto"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { diffFindings, rerunAffectedProjects } from "../src/engine/rerunAll.js"
import { expireObstacles } from "../src/worker/hygiene.js"
import { runImport } from "../src/worker/importer.js"
import { createFakeDb } from "./helpers/fakeDb.js"
import { cityPoints, createRoutedProject, jsonResponse, makeApp, midOf } from "./helpers/testApp.js"

const quiet = () => {}
const isoDaysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const item = (externeId, over = {}) => ({
  externeId, kategorie: "baustelle", name: `Baustelle ${externeId}`,
  lat: 52.3, lng: 9.7, strassenRef: "A2", attrs: {}, quelle: { name: "Mock" }, ...over,
})
const vollbestand = (items) => ({
  quelleId: "0009", name: "Vollbestand-Mock", schedule: "0 4 * * *", vollbestand: true,
  fetch: async () => ({ obstacles: items }),
})
const fenster = (items) => ({
  quelleId: "0009", name: "Fenster-Mock", schedule: "0 4 * * *",
  fetch: async () => ({ obstacles: items }),
})

describe("Vollbestand-Reconcile (Importer)", () => {
  it("im Feed fehlende Einträge werden deaktiviert (nicht gelöscht)", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: vollbestand([item("a"), item("b")]), log: quiet })
    expect(db.state.obstacles.filter((o) => o.aktiv)).toHaveLength(2)

    const run = await runImport({ db, connector: vollbestand([item("a")]), log: quiet })
    expect(run.stats.deaktiviert).toBe(1)
    expect(db.state.obstacles).toHaveLength(2) // weiterhin in der DB
    expect(db.state.obstacles.find((o) => o.externe_id === "b").aktiv).toBe(false)
    expect(db.state.obstacles.find((o) => o.externe_id === "a").aktiv).toBe(true)
  })

  it("wiederkehrender Eintrag wird reaktiviert", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: vollbestand([item("a"), item("b")]), log: quiet })
    await runImport({ db, connector: vollbestand([item("a")]), log: quiet }) // b raus
    const run = await runImport({ db, connector: vollbestand([item("a"), item("b")]), log: quiet })
    expect(run.stats.reaktiviert).toBe(1)
    expect(db.state.obstacles.find((o) => o.externe_id === "b").aktiv).toBe(true)
  })

  it("leerer Feed deaktiviert NICHT den ganzen Bestand", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: vollbestand([item("a")]), log: quiet })
    const run = await runImport({ db, connector: vollbestand([]), log: quiet })
    expect(run.stats.deaktiviert).toBe(0)
    expect(db.state.obstacles.find((o) => o.externe_id === "a").aktiv).toBe(true)
  })

  it("ohne vollbestand-Flag wird NICHT reconcilet (Fenster-Feed)", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: fenster([item("a"), item("b")]), log: quiet })
    const run = await runImport({ db, connector: fenster([item("a")]), log: quiet })
    expect(run.stats.deaktiviert).toBe(0)
    expect(db.state.obstacles.find((o) => o.externe_id === "b").aktiv).toBe(true)
  })
})

describe("Ablauf-Hygiene (expireObstacles)", () => {
  it("deaktiviert nur >7 Tage über gueltig_bis; offen (null) bleibt", async () => {
    const db = createFakeDb()
    db.state.obstacles.push(
      { id: "o1", aktiv: true, gueltig_bis: isoDaysAgo(10), tenant_id: null, quellen_id: "0001", name: "abgelaufen" },
      { id: "o2", aktiv: true, gueltig_bis: isoDaysAgo(3), tenant_id: null, quellen_id: "0001", name: "frisch abgelaufen" },
      { id: "o3", aktiv: true, gueltig_bis: null, tenant_id: "t", quellen_id: "0100", name: "offen" },
    )
    const expired = await expireObstacles(db)
    expect(expired.map((e) => e.id)).toEqual(["o1"])
    expect(db.state.obstacles.find((o) => o.id === "o1").aktiv).toBe(false)
    expect(db.state.obstacles.find((o) => o.id === "o2").aktiv).toBe(true)
    expect(db.state.obstacles.find((o) => o.id === "o3").aktiv).toBe(true)
  })
})

describe("Fund-Diff (diffFindings)", () => {
  it("erkennt neu / weggefallen / geaendert, ignoriert Unverändertes", () => {
    const before = new Map([
      ["o-gone", { obstacle_id: "o-gone", severity: "warnung", titel: "weg" }],
      ["o-chg", { obstacle_id: "o-chg", severity: "warnung", titel: "chg", gueltig_bis: "2026-08-01" }],
      ["o-same", { obstacle_id: "o-same", severity: "hinweis", titel: "same" }],
    ])
    const after = new Map([
      ["o-new", { obstacle_id: "o-new", severity: "kritisch", titel: "neu" }],
      ["o-chg", { obstacle_id: "o-chg", severity: "kritisch", titel: "chg", gueltig_bis: "2026-08-01" }],
      ["o-same", { obstacle_id: "o-same", severity: "hinweis", titel: "same" }],
    ])
    const events = diffFindings(before, after)
    const byTyp = (t) => events.filter((e) => e.typ === t)
    expect(byTyp("neu")).toHaveLength(1)
    expect(byTyp("neu")[0].severity).toBe("kritisch")
    expect(byTyp("weggefallen")).toHaveLength(1)
    expect(byTyp("weggefallen")[0].severity).toBe("info")
    expect(byTyp("geaendert")).toHaveLength(1)
    expect(events).toHaveLength(3) // o-same erzeugt nichts
  })
})

describe("Auto-Rerun (rerunAffectedProjects)", () => {
  it("neuer Fund auf der Strecke → 'neu'-Benachrichtigung für den Mandanten", async () => {
    const { app, db, tenant } = makeApp()
    const points = cityPoints("Hamburg", "Hannover")
    const p = await createRoutedProject(app, { points })
    await request(app).patch(`/api/projects/${p.id}`).send({ transport: { hoehe: 4.5 } })

    // Erste Auswertung ohne Hindernisse → 0 Funde, status fertig
    await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(db.state.findings.filter((f) => f.project_id === p.id)).toHaveLength(0)

    // Globales Hindernis auf die Streckenmitte (Brücke zu niedrig → kritisch)
    const mid = midOf(points)
    await request(app).post("/api/obstacles").send({
      kategorie: "bruecke", name: "Neue Brücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 }, global: true,
    })

    const res = await rerunAffectedProjects({ db })
    expect(res.neuAusgewertet).toBeGreaterThanOrEqual(1)
    expect(res.benachrichtigungen).toBeGreaterThanOrEqual(1)
    const neu = db.state.notifications.filter((n) => n.tenant_id === tenant.id && n.typ === "neu")
    expect(neu.length).toBeGreaterThanOrEqual(1)
    expect(neu[0].project_id).toBe(p.id) // rohe DB-Row (camelCase erst im Mapper)
  })
})

describe("Notifications-API", () => {
  it("Liste + unread-count, einzeln und alle als gelesen markieren", async () => {
    const { app, db, tenant } = makeApp()
    const n1 = randomUUID()
    const n2 = randomUUID()
    const base = { tenant_id: tenant.id, created_at: new Date().toISOString(), read_at: null }
    db.state.notifications.push(
      { ...base, id: n1, typ: "neu", severity: "kritisch", titel: "Fund A", project_id: "p1", projekt_name: "P" },
      { ...base, id: n2, typ: "weggefallen", severity: "info", titel: "Fund B" },
    )

    const list = await request(app).get("/api/notifications")
    expect(list.status).toBe(200)
    expect(list.body.notifications).toHaveLength(2)
    expect(list.body.unreadCount).toBe(2)

    expect((await request(app).post(`/api/notifications/${n1}/read`)).body.updated).toBe(1)
    expect((await request(app).get("/api/notifications/unread-count")).body.count).toBe(1)
    expect((await request(app).post("/api/notifications/read-all")).body.updated).toBe(1)
    expect((await request(app).get("/api/notifications/unread-count")).body.count).toBe(0)
  })

  it("fremde Mandanten-Nachrichten sind unsichtbar", async () => {
    const { app, db } = makeApp()
    db.state.notifications.push({
      id: randomUUID(), tenant_id: randomUUID(), typ: "neu", severity: "warnung",
      titel: "fremd", created_at: new Date().toISOString(), read_at: null,
    })
    const list = await request(app).get("/api/notifications")
    expect(list.body.notifications).toHaveLength(0)
  })
})

describe("Sync-API", () => {
  it("/status liefert Quellen-Status + connector/vollbestand-Flags", async () => {
    const { app } = makeApp()
    const res = await request(app).get("/api/sync/status")
    expect(res.status).toBe(200)
    expect(res.body.connectorAnzahl).toBe(44) // +0303 +0129/0130 +0224-0228 +0131/0132 +0229 +0150 (Autobahn lastbeschr. Brücken); OSM (0301)/LMS-BW (0122)/Düsseldorf (0217)/Bedarfsumleitungen-HH (0113) entfernt
    const autobahn = res.body.quellen.find((q) => q.id === "0001")
    expect(autobahn.connector).toBe(true)
    expect(autobahn.vollbestand).toBe(true)
    expect(res.body.quellen.find((q) => q.id === "0002").connector).toBe(false)
  })

  it("/status spiegelt den letzten Import-Lauf-Status je Quelle (letzterStatus)", async () => {
    const { app, db } = makeApp()
    // Zwei Läufe für 0001: alt 'ok', neu 'error' → letzterStatus muss 'error' sein (jüngster gewinnt).
    db.state.importRuns.push(
      { id: randomUUID(), quelle_id: "0001", status: "ok", started_at: "2026-06-17T08:00:00.000Z" },
      { id: randomUUID(), quelle_id: "0001", status: "error", started_at: "2026-06-17T12:00:00.000Z" },
    )
    const res = await request(app).get("/api/sync/status")
    expect(res.body.quellen.find((q) => q.id === "0001").letzterStatus).toBe("error")
    // Quelle ohne Lauf → null.
    expect(res.body.quellen.find((q) => q.id === "0002").letzterStatus).toBe(null)
  })

  it("POST startet einen Sync-Job, der bis 'done' durchläuft", async () => {
    // Deterministischer 2-Connector-Satz injiziert (prod zieht allConnectors). So
    // testet der Lifecycle ohne 35 echte Connectoren — schnell und stabil.
    const syncConnectors = [vollbestand([item("a")]), { ...fenster([item("b")]), quelleId: "0008" }]
    const { app } = makeApp({ syncConnectors })
    const start = await request(app).post("/api/sync")
    expect(start.status).toBe(202)
    expect(["running", "done"]).toContain(start.body.status)
    expect(start.body.total).toBe(2) // genau der injizierte Satz wird gezogen
    const jobId = start.body.id

    let job
    for (let i = 0; i < 100; i += 1) {
      job = (await request(app).get(`/api/sync/${jobId}`)).body
      if (job.status !== "running") break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(job.status).toBe("done")
    expect(job.done).toBe(job.total)
    expect(job.rerun).toBeTruthy()
  })
})
