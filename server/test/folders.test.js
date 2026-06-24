// Projekt-Ordner (T-177): CRUD + Unterordner + Projekt-Zuordnung + Mandanten-Isolation.
import { describe, expect, it } from "vitest"
import request from "supertest"
import { createProject, makeApp } from "./helpers/testApp.js"

describe("Folders API (T-177)", () => {
  it("legt Ordner + Unterordner an, listet, benennt um", async () => {
    const { app } = makeApp()

    const root = await request(app).post("/api/folders").send({ name: "Kunde Enercon" })
    expect(root.status).toBe(201)
    expect(root.body).toMatchObject({ name: "Kunde Enercon", parentId: null })

    const sub = await request(app)
      .post("/api/folders")
      .send({ name: "2026", parentId: root.body.id })
    expect(sub.status).toBe(201)
    expect(sub.body.parentId).toBe(root.body.id)

    const list = await request(app).get("/api/folders")
    expect(list.status).toBe(200)
    expect(list.body.folders).toHaveLength(2)

    const ren = await request(app).patch(`/api/folders/${root.body.id}`).send({ name: "Enercon GmbH" })
    expect(ren.status).toBe(200)
    expect(ren.body.name).toBe("Enercon GmbH")
  })

  it("ordnet ein Projekt einem Ordner zu und wieder zur Wurzel", async () => {
    const { app } = makeApp()
    const folder = (await request(app).post("/api/folders").send({ name: "Ordner" })).body
    const project = await createProject(app, "P1")

    const into = await request(app).patch(`/api/projects/${project.id}`).send({ folderId: folder.id })
    expect(into.status).toBe(200)
    expect(into.body.folderId).toBe(folder.id)

    const out = await request(app).patch(`/api/projects/${project.id}`).send({ folderId: null })
    expect(out.status).toBe(200)
    expect(out.body.folderId).toBe(null)
  })

  it("löscht einen Ordner → Projekte bleiben, folderId fällt auf null", async () => {
    const { app } = makeApp()
    const folder = (await request(app).post("/api/folders").send({ name: "Weg" })).body
    const project = await createProject(app, "P2")
    await request(app).patch(`/api/projects/${project.id}`).send({ folderId: folder.id })

    const del = await request(app).delete(`/api/folders/${folder.id}`)
    expect(del.status).toBe(204)

    const after = await request(app).get(`/api/projects/${project.id}`)
    expect(after.status).toBe(200)
    expect(after.body.folderId).toBe(null) // Projekt überlebt, Zuordnung weg
  })

  it("verschiebt einen Ordner per parentId und wieder zur Wurzel", async () => {
    const { app } = makeApp()
    const a = (await request(app).post("/api/folders").send({ name: "A" })).body
    const b = (await request(app).post("/api/folders").send({ name: "B" })).body

    const into = await request(app).patch(`/api/folders/${b.id}`).send({ parentId: a.id })
    expect(into.status).toBe(200)
    expect(into.body.parentId).toBe(a.id)

    const out = await request(app).patch(`/api/folders/${b.id}`).send({ parentId: null })
    expect(out.status).toBe(200)
    expect(out.body.parentId).toBe(null)
  })

  it("verhindert Zyklen: Ordner kann nicht in seinen eigenen Unterordner", async () => {
    const { app } = makeApp()
    const parent = (await request(app).post("/api/folders").send({ name: "Parent" })).body
    const child = (await request(app).post("/api/folders").send({ name: "Child", parentId: parent.id })).body

    // parent unter child schieben → Zyklus → 400
    const cyc = await request(app).patch(`/api/folders/${parent.id}`).send({ parentId: child.id })
    expect(cyc.status).toBe(400)

    // in sich selbst → 400
    const self = await request(app).patch(`/api/folders/${parent.id}`).send({ parentId: parent.id })
    expect(self.status).toBe(400)
  })

  it("weist Projekt einem fremden Ordner ab (404)", async () => {
    const { app } = makeApp()
    const project = await createProject(app, "P3")
    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ folderId: "11111111-1111-4111-8111-111111111111" })
    expect(res.status).toBe(404)
  })

  it("private Ordner: nur Besitzer + Admin sehen sie, andere Mitglieder nicht (kein Leak)", async () => {
    const { app } = makeApp()
    const alice = { "X-Auth-Email": "alice@setreo.de", "X-Auth-Roles": "" } // intern, Nicht-Admin
    const bob = { "X-Auth-Email": "bob@setreo.de", "X-Auth-Roles": "" }

    const priv = await request(app).post("/api/folders").set(alice).send({ name: "Alice Privat", private: true })
    expect(priv.status).toBe(201)
    expect(priv.body.owner).toBe("alice@setreo.de")

    // Bob (anderes Mitglied) sieht den privaten Ordner NICHT und kann ihn nicht löschen.
    const bobList = await request(app).get("/api/folders").set(bob)
    expect(bobList.body.folders.find((f) => f.id === priv.body.id)).toBeUndefined()
    expect((await request(app).delete(`/api/folders/${priv.body.id}`).set(bob)).status).toBe(404)

    // Besitzerin sieht ihn.
    const aliceList = await request(app).get("/api/folders").set(alice)
    expect(aliceList.body.folders.find((f) => f.id === priv.body.id)).toBeDefined()

    // Setreo-Admin (Default-Dev-Admin) sieht alles (Max-Entscheid).
    const adminList = await request(app).get("/api/folders")
    expect(adminList.body.folders.find((f) => f.id === priv.body.id)).toBeDefined()
  })

  it("private Projekte (im privaten Ordner) sind nur für den Besitzer sichtbar", async () => {
    const { app } = makeApp()
    const alice = { "X-Auth-Email": "alice@setreo.de", "X-Auth-Roles": "" }
    const bob = { "X-Auth-Email": "bob@setreo.de", "X-Auth-Roles": "" }

    const folder = (await request(app).post("/api/folders").set(alice).send({ name: "Geheim", private: true })).body
    const proj = (await request(app).post("/api/projects").set(alice).send({ name: "Geheimprojekt" })).body
    // In den privaten Ordner ziehen → erbt dessen Zone (owner = alice).
    const moved = await request(app).patch(`/api/projects/${proj.id}`).set(alice).send({ folderId: folder.id })
    expect(moved.status).toBe(200)
    expect(moved.body.owner).toBe("alice@setreo.de")

    // Bob sieht es weder in der Liste noch per Direktzugriff.
    const bobList = await request(app).get("/api/projects").set(bob)
    expect(bobList.body.projects.find((p) => p.id === proj.id)).toBeUndefined()
    expect((await request(app).get(`/api/projects/${proj.id}`).set(bob)).status).toBe(404)

    // Besitzerin schon.
    expect((await request(app).get(`/api/projects/${proj.id}`).set(alice)).status).toBe(200)
  })

  it("isoliert Ordner zwischen Mandanten", async () => {
    const { app, db } = makeApp()
    const other = db.seedTenant({ slug: "enercon", name: "Enercon" })
    // Admin (Dev-Mode) auf fremden Mandanten via X-Tenant → eigener Ordner dort
    const f = await request(app).post("/api/folders").set("X-Tenant", other.slug).send({ name: "Fremd" })
    expect(f.status).toBe(201)

    // Default-Mandant setreo sieht den Enercon-Ordner NICHT
    const mine = await request(app).get("/api/folders")
    expect(mine.body.folders.find((x) => x.id === f.body.id)).toBeUndefined()

    // und kann ihn nicht löschen (404)
    const del = await request(app).delete(`/api/folders/${f.body.id}`)
    expect(del.status).toBe(404)
  })
})
