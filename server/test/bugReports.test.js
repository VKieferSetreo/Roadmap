// Bug-Reports: Melden (jeder Eingeloggte) + Admin-Triage (Liste/Status/Notiz/Löschen).

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
const asUser = (req) => req.set("X-Auth-User", "vki@setreo.de").set("X-Auth-Roles", "user")

describe("Bug-Reports", () => {
  it("POST: jeder Eingeloggte meldet → 201, Meldender/Mandant/Admin serverseitig gestempelt", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const res = await asUser(
      request(app).post("/api/bug-reports").send({
        beschreibung: "Karte lädt nicht im Projekt-Tab",
        viewPath: "/projekte/abc/karte",
        kontext: { appVersion: "3.0.0", mode: "live", viewport: "1440x900" },
      }),
    )
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      email: "vki@setreo.de",
      tenantSlug: "setreo",
      isAdmin: false,
      beschreibung: "Karte lädt nicht im Projekt-Tab",
      viewPath: "/projekte/abc/karte",
      status: "offen",
    })
    expect(res.body.kontext.appVersion).toBe("3.0.0")
    expect(db.state.bugReports).toHaveLength(1)
  })

  it("POST: leere Beschreibung → 400", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "  " }))
    expect(res.status).toBe(400)
  })

  it("POST: Screenshot raster-only — data:image/svg+xml verworfen, PNG bleibt (T-291)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const svg = await asUser(
      request(app).post("/api/bug-reports").send({
        beschreibung: "XSS-Versuch",
        screenshot: "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+",
      }),
    )
    expect(svg.status).toBe(201)
    expect(svg.body.screenshot).toBeNull()

    const png = await asUser(
      request(app).post("/api/bug-reports").send({
        beschreibung: "echter Screenshot",
        screenshot: "data:image/png;base64,iVBORw0KGgo=",
      }),
    )
    expect(png.body.screenshot).toBe("data:image/png;base64,iVBORw0KGgo=")
  })

  it("GET: nur Admin (User → 403), liefert Liste + Status-Zähler", async () => {
    const { app } = makeApp({ requireAuth: true })
    await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "Bug 1" }))
    await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "Bug 2" }))

    expect((await asUser(request(app).get("/api/bug-reports"))).status).toBe(403)

    const res = await asAdmin(request(app).get("/api/bug-reports"))
    expect(res.status).toBe(200)
    expect(res.body.reports).toHaveLength(2)
    expect(res.body.zaehler).toMatchObject({ offen: 2, in_arbeit: 0, erledigt: 0, verworfen: 0 })
  })

  it("GET ?status filtert", async () => {
    const { app } = makeApp({ requireAuth: true })
    const r = await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "X" }))
    await asAdmin(request(app).patch(`/api/bug-reports/${r.body.id}`).send({ status: "erledigt" }))
    await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "Y" }))

    const offen = await asAdmin(request(app).get("/api/bug-reports?status=offen"))
    expect(offen.body.reports).toHaveLength(1)
    expect(offen.body.reports[0].beschreibung).toBe("Y")
  })

  it("PATCH: Status erledigt setzt resolved_at, zurück auf offen löscht es (Admin-only)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const r = await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "Z" }))
    const id = r.body.id

    expect((await asUser(request(app).patch(`/api/bug-reports/${id}`).send({ status: "erledigt" }))).status).toBe(403)

    const done = await asAdmin(request(app).patch(`/api/bug-reports/${id}`).send({ status: "erledigt" }))
    expect(done.body.status).toBe("erledigt")
    expect(done.body.resolvedAt).toBeTruthy()

    const reopen = await asAdmin(request(app).patch(`/api/bug-reports/${id}`).send({ status: "offen" }))
    expect(reopen.body.status).toBe("offen")
    expect(reopen.body.resolvedAt).toBeNull()
  })

  it("PATCH: Notiz pflegen, ungültiger Status → 400, nichts zu ändern → 400", async () => {
    const { app } = makeApp({ requireAuth: true })
    const r = await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "N" }))
    const id = r.body.id

    const withNote = await asAdmin(request(app).patch(`/api/bug-reports/${id}`).send({ notiz: "Bekannt, Fix in Arbeit" }))
    expect(withNote.body.notiz).toBe("Bekannt, Fix in Arbeit")
    expect(withNote.body.status).toBe("offen") // unverändert

    expect((await asAdmin(request(app).patch(`/api/bug-reports/${id}`).send({ status: "ufo" }))).status).toBe(400)
    expect((await asAdmin(request(app).patch(`/api/bug-reports/${id}`).send({}))).status).toBe(400)
  })

  it("DELETE: nur Admin → 204", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const r = await asUser(request(app).post("/api/bug-reports").send({ beschreibung: "del" }))
    const id = r.body.id

    expect((await asUser(request(app).delete(`/api/bug-reports/${id}`))).status).toBe(403)
    expect((await asAdmin(request(app).delete(`/api/bug-reports/${id}`))).status).toBe(204)
    expect(db.state.bugReports).toHaveLength(0)
  })
})
