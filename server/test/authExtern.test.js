// setreo-auth-extern-Integration: Gateway-Trennung (X-Auth-Gateway) +
// Kunden-Provisioning (POST /api/admin/tenants/:id/users → PUT /internal/users).

import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")

const AUTH_EXTERN = { url: "http://setreo-auth-extern:8095", secret: "s".repeat(32) }

/** fetch-Mock für den extern-Auth: antwortet mit status (201 = neu angelegt). */
function provisionFetch(status = 201) {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => ({ id: "u-1", email: "kunde@firma.de", created: status === 201 }),
  }))
}

/** Tenant anlegen (+ Mitglieder direkt in den Fake-State, ohne Provisionierung). */
async function makeTenantWithMember(app, db, { slug = "kunde-a", members = [] } = {}) {
  const res = await asAdmin(request(app).post("/api/admin/tenants")).send({ slug, name: slug })
  expect(res.status).toBe(201)
  for (const email of members) {
    db.state.members.push({
      tenant_id: res.body.id, email: email.toLowerCase(), role: "user",
      passwort_klar: null, created_at: new Date().toISOString(),
    })
  }
  return res.body
}

describe("gateway-trennung (X-Auth-Gateway: extern)", () => {
  it("externe Identität bekommt NIE admin — auch mit gefälschtem Rollen-Header", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenantWithMember(app, db, { members: ["kunde@firma.de"] })

    const ctx = await request(app)
      .get("/api/context")
      .set("X-Auth-User", "kunde@firma.de")
      .set("X-Auth-Roles", "admin")
      .set("X-Auth-Gateway", "extern")
    expect(ctx.status).toBe(200)
    expect(ctx.body.isAdmin).toBe(false)
    expect(ctx.body.tenants).toBeUndefined()
    expect(ctx.body.tenant?.slug).toBe("kunde-a")
  })

  it("extern: Admin-API 403, X-Tenant-Switch wird ignoriert", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenantWithMember(app, db, { members: ["kunde@firma.de"] })

    const admin = await request(app)
      .get("/api/admin/tenants")
      .set("X-Auth-User", "kunde@firma.de")
      .set("X-Auth-Roles", "admin")
      .set("X-Auth-Gateway", "extern")
    expect(admin.status).toBe(403)

    const ctx = await request(app)
      .get("/api/context")
      .set("X-Auth-User", "kunde@firma.de")
      .set("X-Auth-Roles", "admin")
      .set("X-Auth-Gateway", "extern")
      .set("X-Tenant", "setreo")
    expect(ctx.body.tenant?.slug).toBe("kunde-a")
  })

  it("interner Admin bleibt unberührt (ohne Gateway-Header = intern)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const ctx = await asAdmin(request(app).get("/api/context"))
    expect(ctx.body.isAdmin).toBe(true)
  })

  it("X-Auth-Email hat Vorrang: User-ID in X-Auth-User bricht das Mapping nicht", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenantWithMember(app, db, { members: ["kunde@firma.de"] })

    const ctx = await request(app)
      .get("/api/context")
      .set("X-Auth-User", "824de49a596d4ff8bc11ad87b6752be1")
      .set("X-Auth-Email", "kunde@firma.de")
      .set("X-Auth-Roles", "roadmap")
    expect(ctx.status).toBe(200)
    expect(ctx.body.email).toBe("kunde@firma.de")
    expect(ctx.body.tenant?.slug).toBe("kunde-a")
  })
})

describe("kunden-provisioning POST /api/admin/tenants/:id/users", () => {
  it("legt Konto im extern-Auth an + trägt Mitgliedschaft ein (201)", async () => {
    const fetchImpl = provisionFetch(201)
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db)

    const res = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "Kunde@Firma.de", password: "geheim-1234" })
    expect(res.status).toBe(201)
    expect(res.body.created).toBe(true)
    expect(res.body.email).toBe("kunde@firma.de")
    expect(res.body.tenant.mitglieder.map((m) => m.email)).toContain("kunde@firma.de")

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe("http://setreo-auth-extern:8095/internal/users")
    expect(init.method).toBe("PUT")
    expect(init.headers["x-provision-secret"]).toBe(AUTH_EXTERN.secret)
    expect(JSON.parse(init.body)).toEqual({ email: "kunde@firma.de", password: "geheim-1234" })
  })

  it("bestehendes Konto: 200 (Passwort-Reset), Mitgliedschaft bleibt einfach", async () => {
    const fetchImpl = provisionFetch(200)
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db, { members: ["kunde@firma.de"] })

    const res = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "kunde@firma.de", password: "neues-passwort" })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(false)
    expect(db.state.members.filter((m) => m.email === "kunde@firma.de")).toHaveLength(1)
  })

  it("E-Mail gehört anderem Mandanten → 409, extern-Auth wird NICHT angerufen", async () => {
    const fetchImpl = provisionFetch(201)
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db)
    await makeTenantWithMember(app, db, { slug: "kunde-b", members: ["kunde@firma.de"] })

    const res = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "kunde@firma.de", password: "geheim-1234" })
    expect(res.status).toBe(409)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("Validierung: Passwort zu kurz 400, kaputte E-Mail 400, ohne Config 503", async () => {
    const fetchImpl = provisionFetch(201)
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db)

    const short = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "kunde@firma.de", password: "kurz" })
    expect(short.status).toBe(400)

    const badMail = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "keine-mail", password: "geheim-1234" })
    expect(badMail.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()

    const { app: unconfigured, db: db2 } = makeApp({ requireAuth: true, authExtern: { url: "", secret: "" } })
    const t2 = await makeTenantWithMember(unconfigured, db2)
    const res = await asAdmin(request(unconfigured).post(`/api/admin/tenants/${t2.id}/users`))
      .send({ email: "kunde@firma.de", password: "geheim-1234" })
    expect(res.status).toBe(503)
  })

  it("extern-Auth down → 502, keine Mitgliedschaft angelegt", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED")
    })
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db)

    const res = await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/users`))
      .send({ email: "kunde@firma.de", password: "geheim-1234" })
    expect(res.status).toBe(502)
    expect(db.state.members.some((m) => m.email === "kunde@firma.de")).toBe(false)
  })

  it("nur Admin darf provisionieren (extern-Gateway 403)", async () => {
    const fetchImpl = provisionFetch(201)
    const { app, db } = makeApp({ requireAuth: true, fetchImpl, authExtern: AUTH_EXTERN })
    const tenant = await makeTenantWithMember(app, db, { members: ["kunde@firma.de"] })

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant.id}/users`)
      .set("X-Auth-User", "kunde@firma.de")
      .set("X-Auth-Roles", "admin")
      .set("X-Auth-Gateway", "extern")
      .send({ email: "neu@firma.de", password: "geheim-1234" })
    expect(res.status).toBe(403)
  })
})

describe("Admin-Allowlist (ROADMAP_ADMIN_EMAILS)", () => {
  it("gesetzt: nur gelistete interne Mail ist Admin; andere → normale User (Tenant-Zugang bleibt)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await makeTenantWithMember(app, db, { slug: "firma-x", members: ["team@setreo.de"] })
    process.env.ROADMAP_ADMIN_EMAILS = "chef@setreo.de"
    try {
      const a = await request(app)
        .get("/api/context")
        .set("X-Auth-Email", "chef@setreo.de")
        .set("X-Auth-Roles", "admin")
      expect(a.body.isAdmin).toBe(true)

      const b = await request(app)
        .get("/api/context")
        .set("X-Auth-Email", "team@setreo.de")
        .set("X-Auth-Roles", "admin")
      expect(b.body.isAdmin).toBe(false)
      expect(b.body.tenant?.slug).toBe("firma-x") // normaler User behält Tenant-Zugang
    } finally {
      delete process.env.ROADMAP_ADMIN_EMAILS
    }
  })
})
