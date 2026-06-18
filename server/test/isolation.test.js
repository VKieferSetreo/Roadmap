// Cross-Tenant-Isolation (T-157): codifiziert die "strikte Trennung" als Negativtests.
// Ergänzt die bestehenden Scoping-Tests (tenants.test, authExtern.test) um die Fälle
// Nicht-Admin-X-Tenant-Hopping, Cross-Tenant-PATCH und gefälschte Admin-Rolle bei extern.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
const asUser = (email) => (req) => req.set("X-Auth-User", email).set("X-Auth-Roles", "user")

async function makeTenant(app, db, { slug, name, members = [] }) {
  const res = await asAdmin(request(app).post("/api/admin/tenants")).send({ slug, name })
  expect(res.status).toBe(201)
  for (const email of members) {
    db.state.members.push({
      tenant_id: res.body.id, email: email.toLowerCase(), role: "user",
      created_at: new Date().toISOString(),
    })
  }
  return res.body
}

describe("Cross-Tenant-Isolation (T-157)", () => {
  it("Nicht-Admin: X-Tenant-Header wird ignoriert (kein Tenant-Hopping)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenant(app, db, { slug: "kunde-a", name: "A", members: ["a@kunde-a.de"] })
    // Setreo-Projekt im setreo-Mandanten
    const setreoProj = await asAdmin(request(app).post("/api/projects")).send({ name: "Geheim" })
    expect(setreoProj.status).toBe(201)

    // Nicht-Admin aus kunde-a versucht per X-Tenant: setreo an fremde Projekte zu kommen
    const list = await asUser("a@kunde-a.de")(request(app).get("/api/projects")).set("X-Tenant", "setreo")
    expect(list.status).toBe(200)
    expect(list.body.projects).toEqual([]) // X-Tenant ignoriert → nur eigener (leerer) Mandant

    const direct = await asUser("a@kunde-a.de")(request(app).get(`/api/projects/${setreoProj.body.id}`)).set("X-Tenant", "setreo")
    expect(direct.status).toBe(404)
  })

  it("Cross-Tenant Projekt-PATCH → 404 (keine Kaperung über fremde ID)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenant(app, db, { slug: "kunde-a", name: "A", members: ["a@kunde-a.de"] })
    const setreoProj = await asAdmin(request(app).post("/api/projects")).send({ name: "Fremd" })
    const patch = await asUser("a@kunde-a.de")(request(app).patch(`/api/projects/${setreoProj.body.id}`)).send({ name: "Gekapert" })
    expect(patch.status).toBe(404)
  })

  it("Externe Identität bleibt extern — gefälschte admin-Rolle + X-Tenant wirkungslos", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenant(app, db, { slug: "kunde-a", name: "A", members: ["a@kunde-a.de"] })
    await asAdmin(request(app).post("/api/projects")).send({ name: "Setreo-Geheim" })

    const res = await request(app)
      .get("/api/projects")
      .set("X-Auth-Email", "a@kunde-a.de")
      .set("X-Auth-Gateway", "extern")
      .set("X-Auth-Roles", "admin") // gefälscht — extern erzwingt roles=["extern"]
      .set("X-Tenant", "setreo") // ignoriert für Nicht-Admin
    expect(res.status).toBe(200)
    expect(res.body.projects).toEqual([]) // bleibt im eigenen (leeren) Mandanten

    // /api/context bestätigt: kein Admin, keine Tenant-Liste
    const ctx = await request(app).get("/api/context")
      .set("X-Auth-Email", "a@kunde-a.de").set("X-Auth-Gateway", "extern").set("X-Auth-Roles", "admin")
    expect(ctx.body.isAdmin).toBe(false)
    expect(ctx.body.tenants).toBeUndefined()
  })
})
