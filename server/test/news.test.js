// News-Feed: Liste (jeder Eingeloggte) + Anlegen/Löschen (nur Admin).

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-Email", "mxk@setreo.de").set("X-Auth-Roles", "admin")
const asExtern = (req, email = "k@firma.de") =>
  req.set("X-Auth-Email", email).set("X-Auth-Gateway", "extern")

describe("News-Feed", () => {
  it("Admin legt News an, Liste zeigt sie (neueste zuerst)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const c = await asAdmin(request(app).post("/api/news"))
      .send({ kategorie: "version", titel: "v3.1", body: "Neue Version live" })
    expect(c.status).toBe(201)
    expect(c.body.kategorie).toBe("version")
    expect(c.body.titel).toBe("v3.1")
    const list = await asAdmin(request(app).get("/api/news"))
    expect(list.status).toBe(200)
    expect(list.body.news).toHaveLength(1)
    expect(list.body.news[0].titel).toBe("v3.1")
  })

  it("Liste ist für jeden eingeloggten Nutzer sichtbar", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asExtern(request(app).get("/api/news"))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.news)).toBe(true)
  })

  it("Nicht-Admin darf nicht anlegen → 403", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asExtern(request(app).post("/api/news")).send({ titel: "Spam" })
    expect(res.status).toBe(403)
  })

  it("titel erforderlich → 400", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asAdmin(request(app).post("/api/news")).send({ body: "ohne Titel" })
    expect(res.status).toBe(400)
  })

  it("unbekannte Kategorie fällt auf 'hinweis' zurück", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asAdmin(request(app).post("/api/news")).send({ titel: "x", kategorie: "müll" })
    expect(res.status).toBe(201)
    expect(res.body.kategorie).toBe("hinweis")
  })

  it("Admin löscht News → 204", async () => {
    const { app } = makeApp({ requireAuth: true })
    const c = await asAdmin(request(app).post("/api/news")).send({ titel: "weg damit" })
    const del = await asAdmin(request(app).delete(`/api/news/${c.body.id}`))
    expect(del.status).toBe(204)
    const list = await asAdmin(request(app).get("/api/news"))
    expect(list.body.news).toHaveLength(0)
  })
})
