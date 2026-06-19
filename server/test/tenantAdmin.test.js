// Tenant-Admin Self-Service (T-147): ein Mandanten-eigener Admin (tenant_members.role='admin')
// darf NUR im eigenen Mandanten Nutzer/Rollen/Seats verwalten — nicht global, nicht kommerziell.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
const asUser = (email) => (req) => req.set("X-Auth-User", email).set("X-Auth-Roles", "user")

/** Mandant via Setreo-Admin anlegen + Mitglieder (mit Rolle) direkt in den fakeDb-State. */
async function tenantWithMembers(app, db, { slug, name, members }) {
  const res = await asAdmin(request(app).post("/api/admin/tenants")).send({ slug, name })
  expect(res.status).toBe(201)
  for (const m of members) {
    db.state.members.push({
      tenant_id: res.body.id, email: m.email.toLowerCase(), role: m.role,
      created_at: new Date().toISOString(),
    })
  }
  return res.body
}

describe("Tenant-Admin Self-Service (T-147)", () => {
  async function setup() {
    const { app, db } = makeApp({ requireAuth: true })
    const a = await tenantWithMembers(app, db, {
      slug: "kunde-a", name: "Kunde A",
      members: [{ email: "admin-a@kunde-a.de", role: "admin" }, { email: "user-a@kunde-a.de", role: "user" }],
    })
    const b = await tenantWithMembers(app, db, {
      slug: "kunde-b", name: "Kunde B",
      members: [{ email: "admin-b@kunde-b.de", role: "admin" }],
    })
    return { app, db, a, b }
  }
  // Mitglieder-Liste der bestehenden (Rollen-Update, kein neues Passwort → keine extern-Provision).
  const keepA = [{ email: "admin-a@kunde-a.de", role: "admin" }, { email: "user-a@kunde-a.de", role: "user" }]

  it("Tenant-Admin verwaltet den EIGENEN Mandanten (200)", async () => {
    const { app, a } = await setup()
    const res = await asUser("admin-a@kunde-a.de")(request(app).put(`/api/admin/tenants/${a.id}/members`))
      .send({ members: keepA })
    expect(res.status).toBe(200)
  })

  it("Tenant-Admin kann FREMDEN Mandanten NICHT verwalten (403)", async () => {
    const { app, b } = await setup()
    const res = await asUser("admin-a@kunde-a.de")(request(app).put(`/api/admin/tenants/${b.id}/members`))
      .send({ members: [{ email: "admin-b@kunde-b.de", role: "admin" }] })
    expect(res.status).toBe(403)
  })

  it("Normaler Nutzer (role=user) bekommt 403", async () => {
    const { app, a } = await setup()
    const res = await asUser("user-a@kunde-a.de")(request(app).put(`/api/admin/tenants/${a.id}/members`))
      .send({ members: keepA })
    expect(res.status).toBe(403)
  })

  it("Tenant-Admin darf Lizenz/Seat-Codes NICHT ändern (kommerziell, global) → 403", async () => {
    const { app, a } = await setup()
    const lic = await asUser("admin-a@kunde-a.de")(request(app).patch(`/api/admin/tenants/${a.id}/license`))
      .send({ plan: "pro", maxSeats: 99 })
    expect(lic.status).toBe(403)
    const codes = await asUser("admin-a@kunde-a.de")(request(app).post(`/api/admin/tenants/${a.id}/seat-codes`))
      .send({ count: 5 })
    expect(codes.status).toBe(403)
  })

  it("Tenant-Admin darf keinen Mandanten anlegen (403)", async () => {
    const { app } = await setup()
    const res = await asUser("admin-a@kunde-a.de")(request(app).post("/api/admin/tenants"))
      .send({ slug: "kunde-x", name: "X" })
    expect(res.status).toBe(403)
  })

  it("Tenant-Admin kann sich nicht aussperren: letzter Admin muss bleiben (400)", async () => {
    const { app, a } = await setup()
    const res = await asUser("admin-a@kunde-a.de")(request(app).put(`/api/admin/tenants/${a.id}/members`))
      .send({ members: [{ email: "user-a@kunde-a.de", role: "user" }] }) // kein Admin mehr
    expect(res.status).toBe(400)
  })

  it("Tenant-Admin lädt EIGENE Mitglieder (GET /:id → 200), fremde nicht (403)", async () => {
    const { app, a, b } = await setup()
    const mine = await asUser("admin-a@kunde-a.de")(request(app).get(`/api/admin/tenants/${a.id}`))
    expect(mine.status).toBe(200)
    expect(mine.body.mitglieder.map((m) => m.email).sort()).toEqual(["admin-a@kunde-a.de", "user-a@kunde-a.de"])
    const other = await asUser("admin-a@kunde-a.de")(request(app).get(`/api/admin/tenants/${b.id}`))
    expect(other.status).toBe(403)
  })

  it("Globaler Setreo-Admin bleibt unbeschränkt (200)", async () => {
    const { app, a } = await setup()
    const res = await asAdmin(request(app).put(`/api/admin/tenants/${a.id}/members`)).send({ members: keepA })
    expect(res.status).toBe(200)
  })
})
