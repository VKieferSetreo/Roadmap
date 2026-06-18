// Mandanten-Audit-Log (T-158): Schlüssel-Mutationen werden geloggt, GET /audit liefert sie.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-Email", "mxk@setreo.de").set("X-Auth-Roles", "admin")

describe("Mandanten-Audit-Log (T-158)", () => {
  it("Tenant-Anlage + Lizenz-Setzen werden geloggt, GET /audit liefert sie", async () => {
    const { app } = makeApp({ requireAuth: true })
    const created = await asAdmin(request(app).post("/api/admin/tenants"))
      .send({ slug: "auditco", name: "Audit GmbH" })
    expect(created.status).toBe(201)
    const id = created.body.id

    await asAdmin(request(app).patch(`/api/admin/tenants/${id}/license`)).send({ maxSeats: 3 })

    const audit = await asAdmin(request(app).get(`/api/admin/tenants/${id}/audit`))
    expect(audit.status).toBe(200)
    const actions = audit.body.entries.map((e) => e.action)
    expect(actions).toContain("tenant.create")
    expect(actions).toContain("tenant.license")
    expect(audit.body.entries.every((e) => e.actorEmail === "mxk@setreo.de")).toBe(true)
  })

  it("Audit nur für Admin", async () => {
    const { app, tenant } = makeApp({ requireAuth: true })
    const res = await request(app)
      .get(`/api/admin/tenants/${tenant.id}/audit`)
      .set("X-Auth-Email", "kunde@firma.de")
      .set("X-Auth-Gateway", "extern")
    expect(res.status).toBe(403)
  })
})
