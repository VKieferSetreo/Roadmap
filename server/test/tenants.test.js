// Tenant-Scoping + Admin-Mandantenverwaltung (SPEC-backend-v2).

import request from "supertest"
import { describe, expect, it } from "vitest"
import { RESERVED_SLUGS } from "../src/tenants.js"
import { createProject, makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
const asUser = (email) => (req) => req.set("X-Auth-User", email).set("X-Auth-Roles", "user")

/** Zweiten Tenant inkl. Mitglied anlegen (über die Admin-API, als Admin). */
async function createTenant(app, { slug, name, members = [] }) {
  const res = await asAdmin(request(app).post("/api/admin/tenants")).send({ slug, name })
  expect(res.status).toBe(201)
  if (members.length) {
    const put = await asAdmin(request(app).put(`/api/admin/tenants/${res.body.id}/members`))
      .send({ emails: members })
    expect(put.status).toBe(200)
  }
  return res.body
}

describe("tenant-scoping", () => {
  it("User aus Tenant A sieht Projekte aus Tenant B nicht (404/leer)", async () => {
    const { app } = makeApp({ requireAuth: true })
    await createTenant(app, { slug: "kunde-a", name: "Kunde A", members: ["a@kunde-a.de"] })

    // Projekt im Default-Tenant setreo (Admin ohne X-Tenant)
    const setreoProject = await asAdmin(request(app).post("/api/projects")).send({ name: "Setreo-Projekt" })
    expect(setreoProject.status).toBe(201)

    // Mitglied von kunde-a: Liste leer, Fremd-Projekt = 404 (kein Existenz-Orakel)
    const list = await asUser("a@kunde-a.de")(request(app).get("/api/projects"))
    expect(list.status).toBe(200)
    expect(list.body.projects).toEqual([])

    const direct = await asUser("a@kunde-a.de")(
      request(app).get(`/api/projects/${setreoProject.body.id}`),
    )
    expect(direct.status).toBe(404)

    const del = await asUser("a@kunde-a.de")(
      request(app).delete(`/api/projects/${setreoProject.body.id}`),
    )
    expect(del.status).toBe(404)
  })

  it("Admin wechselt Tenants über X-Tenant-Header", async () => {
    const { app } = makeApp({ requireAuth: true })
    await createTenant(app, { slug: "kunde-a", name: "Kunde A" })

    const inKundeA = await asAdmin(request(app).post("/api/projects"))
      .set("X-Tenant", "kunde-a")
      .send({ name: "Kunden-Projekt" })
    expect(inKundeA.status).toBe(201)

    const setreoList = await asAdmin(request(app).get("/api/projects"))
    expect(setreoList.body.projects).toEqual([])

    const kundeList = await asAdmin(request(app).get("/api/projects")).set("X-Tenant", "kunde-a")
    expect(kundeList.body.projects).toHaveLength(1)
    expect(kundeList.body.projects[0].name).toBe("Kunden-Projekt")
  })

  it("findings-Suche ist tenant-gescoped", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    await createTenant(app, { slug: "kunde-a", name: "Kunde A", members: ["a@kunde-a.de"] })
    // Projekt + Fund im setreo-Tenant direkt in den Fake-State legen
    const p = await asAdmin(request(app).post("/api/projects")).send({ name: "Mit Fund" })
    db.state.findings.push({
      id: "f-1", project_id: p.body.id, kategorie: "bruecke", severity: "kritisch",
      titel: "Fund", beschreibung: "", lat: 50, lng: 8, km: 1, detail: {},
      strassen_ref: null, gueltig_von: null, gueltig_bis: null, quelle: null,
      zustaendig: null, route_id: "r-1", route_name: "Hinfahrt", created_at: new Date().toISOString(),
    })

    expect((await asAdmin(request(app).get("/api/findings"))).body.findings).toHaveLength(1)
    expect((await asUser("a@kunde-a.de")(request(app).get("/api/findings"))).body.findings).toHaveLength(0)
  })
})

describe("admin tenants API", () => {
  it("non-admin → 403", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asUser("vki@setreo.de")(request(app).get("/api/admin/tenants"))
    expect(res.status).toBe(403)
  })

  it("GET liefert Tenant-Shape {id, slug, name, mitglieder, projekte}", async () => {
    const { app } = makeApp()
    await createProject(app, "P1")
    const res = await request(app).get("/api/admin/tenants")
    expect(res.status).toBe(200)
    expect(res.body.tenants).toHaveLength(1)
    expect(res.body.tenants[0]).toEqual({
      id: expect.any(String),
      slug: "setreo",
      name: "Setreo",
      mitglieder: ["vki@setreo.de"],
      projekte: 1,
    })
  })

  it("POST validiert slug (Regex + Reserved-Liste) und meldet Duplikate", async () => {
    const { app } = makeApp()
    for (const slug of ["X", "a", "Ä-umlaut", "mit space", "a".repeat(41)]) {
      const res = await request(app).post("/api/admin/tenants").send({ slug, name: "N" })
      expect(res.status, `slug "${slug}"`).toBe(400)
    }
    for (const slug of RESERVED_SLUGS) {
      const res = await request(app).post("/api/admin/tenants").send({ slug, name: "N" })
      expect(res.status, `reserved "${slug}"`).toBe(400)
    }
    expect((await request(app).post("/api/admin/tenants").send({ slug: "ok-slug" })).status).toBe(400) // name fehlt

    const created = await request(app).post("/api/admin/tenants").send({ slug: "kunde-a", name: "Kunde A" })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ slug: "kunde-a", name: "Kunde A", mitglieder: [], projekte: 0 })

    const dup = await request(app).post("/api/admin/tenants").send({ slug: "kunde-a", name: "Nochmal" })
    expect(dup.status).toBe(409)
  })

  it("PATCH rename, DELETE nur ohne Projekte (sonst 409)", async () => {
    const { app, tenant } = makeApp()
    const renamed = await request(app).patch(`/api/admin/tenants/${tenant.id}`).send({ name: "Setreo GmbH" })
    expect(renamed.status).toBe(200)
    expect(renamed.body.name).toBe("Setreo GmbH")

    await createProject(app, "Blockiert Löschung")
    expect((await request(app).delete(`/api/admin/tenants/${tenant.id}`)).status).toBe(409)

    const empty = await request(app).post("/api/admin/tenants").send({ slug: "leer", name: "Leer" })
    expect((await request(app).delete(`/api/admin/tenants/${empty.body.id}`)).status).toBe(204)
    expect((await request(app).delete(`/api/admin/tenants/${empty.body.id}`)).status).toBe(404)
  })

  it("PUT members ersetzt die Liste (lowercase) — E-Mail nur in EINEM Tenant (409)", async () => {
    const { app, tenant } = makeApp()
    const put = await request(app).put(`/api/admin/tenants/${tenant.id}/members`).send({
      emails: ["Neu@Setreo.DE", "vki@setreo.de", "neu@setreo.de"], // Dupes + Mixed-Case
    })
    expect(put.status).toBe(200)
    expect(put.body.mitglieder.sort()).toEqual(["neu@setreo.de", "vki@setreo.de"])

    const other = await request(app).post("/api/admin/tenants").send({ slug: "kunde-a", name: "Kunde A" })
    const conflict = await request(app).put(`/api/admin/tenants/${other.body.id}/members`).send({
      emails: ["vki@setreo.de"],
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toContain("vki@setreo.de")

    expect((await request(app).put(`/api/admin/tenants/${tenant.id}/members`).send({ emails: "x" })).status).toBe(400)
    expect((await request(app).put(`/api/admin/tenants/${tenant.id}/members`).send({ emails: ["keine-mail"] })).status).toBe(400)
  })

  it("context-Switcher: Admin sieht neue Tenants sofort in tenants[]", async () => {
    const { app } = makeApp()
    await request(app).post("/api/admin/tenants").send({ slug: "kunde-a", name: "Kunde A" })
    const ctx = await request(app).get("/api/context")
    expect(ctx.body.tenants.map((t) => t.slug).sort()).toEqual(["kunde-a", "setreo"])
  })
})
