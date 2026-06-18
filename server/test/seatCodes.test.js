// Seat-Codes: Format (pure) + Generierung (Admin) + Einlösung (Konto-Router) end-to-end.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { generateCode, normalizeCode } from "../src/seatCodes.js"
import { makeApp } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-Email", "mxk@setreo.de").set("X-Auth-Roles", "admin")
const asExtern = (req, email) => req.set("X-Auth-Email", email).set("X-Auth-Gateway", "extern")

describe("seatCodes — Code-Format", () => {
  it("generateCode: 3 Gruppen a 4 Zeichen, keine mehrdeutigen Zeichen", () => {
    const c = generateCode()
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(c).not.toMatch(/[01OIL]/)
  })
  it("normalizeCode: Kleinschreibung/Leerzeichen ok, Müll → leer", () => {
    const c = generateCode()
    expect(normalizeCode(c.toLowerCase().replaceAll("-", " "))).toBe(c)
    expect(normalizeCode("zu kurz")).toBe("")
    expect(normalizeCode("")).toBe("")
  })
})

describe("seatCodes — Generierung + Einlösung end-to-end", () => {
  it("Admin setzt Lizenz + generiert Codes, Kunde löst ein und ist Mitglied", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const kunde = db.seedTenant({ slug: "enercon", name: "Enercon" })

    const lic = await asAdmin(request(app).patch(`/api/admin/tenants/${kunde.id}/license`))
      .send({ plan: "standard", maxSeats: 2, validUntil: "2027-12-31" })
    expect(lic.status).toBe(200)
    expect(lic.body.max_seats).toBe(2)

    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${kunde.id}/seat-codes`)).send({})
    expect(gen.status).toBe(201)
    expect(gen.body.codes).toHaveLength(2)
    const code = gen.body.codes[0].code

    const redeem = await asExtern(request(app).post("/api/account/redeem-seat"), "mitarbeiter@enercon.de")
      .send({ code })
    expect(redeem.status).toBe(201)
    expect(redeem.body.tenant.slug).toBe("enercon")

    const ctx = await asExtern(request(app).get("/api/context"), "mitarbeiter@enercon.de")
    expect(ctx.body.tenant?.slug).toBe("enercon")
  })

  it("verbrauchter Code → 409", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const kunde = db.seedTenant({ slug: "enercon", name: "Enercon" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${kunde.id}/license`)).send({ maxSeats: 1 })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${kunde.id}/seat-codes`)).send({})
    const code = gen.body.codes[0].code

    await asExtern(request(app).post("/api/account/redeem-seat"), "a@enercon.de").send({ code })
    const again = await asExtern(request(app).post("/api/account/redeem-seat"), "b@enercon.de").send({ code })
    expect(again.status).toBe(409)
  })

  it("ungültiges Code-Format → 400", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asExtern(request(app).post("/api/account/redeem-seat"), "x@y.de").send({ code: "nope" })
    expect(res.status).toBe(400)
  })

  it("eine E-Mail = ein Mandant: bereits zugeordnet → 409", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const a = db.seedTenant({ slug: "enercon", name: "Enercon" })
    const b = db.seedTenant({ slug: "siemensx", name: "Siemens" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${a.id}/license`)).send({ maxSeats: 1 })
    await asAdmin(request(app).patch(`/api/admin/tenants/${b.id}/license`)).send({ maxSeats: 1 })
    const ga = await asAdmin(request(app).post(`/api/admin/tenants/${a.id}/seat-codes`)).send({})
    const gb = await asAdmin(request(app).post(`/api/admin/tenants/${b.id}/seat-codes`)).send({})
    await asExtern(request(app).post("/api/account/redeem-seat"), "dup@x.de").send({ code: ga.body.codes[0].code })
    const second = await asExtern(request(app).post("/api/account/redeem-seat"), "dup@x.de")
      .send({ code: gb.body.codes[0].code })
    expect(second.status).toBe(409)
  })

  it("GET seat-codes liefert Lizenz + Codes (Backoffice-Lesepfad)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "enercon", name: "Enercon" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`))
      .send({ plan: "pro", maxSeats: 3, validUntil: "2027-01-01" })
    await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({})
    const res = await asAdmin(request(app).get(`/api/admin/tenants/${k.id}/seat-codes`))
    expect(res.status).toBe(200)
    expect(res.body.license).toEqual({ plan: "pro", maxSeats: 3, validUntil: "2027-01-01" })
    expect(res.body.codes).toHaveLength(3)
  })
})
