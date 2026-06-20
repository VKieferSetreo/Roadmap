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

  it("Seat-Limit: PUT members über max_seats → 409 (T-146)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "limit", name: "Limit" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1 })
    const res = await asAdmin(request(app).put(`/api/admin/tenants/${k.id}/members`)).send({
      members: [
        { email: "a@limit.de", role: "user", password: "passwort-123" },
        { email: "b@limit.de", role: "user", password: "passwort-123" },
      ],
    })
    expect(res.status).toBe(409)
  })

  it("Seat-Limit: POST /:id/users über max_seats → 409 vor Provision (T-348)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "postlimit", name: "PostLimit", members: ["a@postlimit.de"] })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1 })
    const res = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/users`))
      .send({ email: "b@postlimit.de", role: "user", password: "passwort-123" })
    expect(res.status).toBe(409) // Limit erreicht → Vorab-Check, kein Provision-Call (sonst 502/503)
  })

  it("Member entfernen gibt den Seat-Code frei (Recycling, T-318/T-353)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "recyc", name: "Recyc" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 2 })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({ count: 1 })
    const code = gen.body.codes[0].code
    await asExtern(request(app).post("/api/account/redeem-seat"), "weg@recyc.de").send({ code })

    let lic = await asAdmin(request(app).get(`/api/admin/tenants/${k.id}/seat-codes`))
    expect(lic.body.codes.find((c) => c.usedBy === "weg@recyc.de")).toBeTruthy()

    // Member via PUT-Liste entfernen (leere Liste, globaler Admin darf admin-los machen)
    const res = await asAdmin(request(app).put(`/api/admin/tenants/${k.id}/members`)).send({ members: [] })
    expect(res.status).toBe(200)

    lic = await asAdmin(request(app).get(`/api/admin/tenants/${k.id}/seat-codes`))
    expect(lic.body.codes.every((c) => c.usedBy === null)).toBe(true) // Seat wieder frei
  })

  it("Member entfernen deaktiviert das Extern-Konto (Offboarding, T-320)", async () => {
    const calls = []
    const fetchImpl = async (url, opts) => {
      calls.push({ url, method: opts?.method ?? "GET" })
      if (opts?.method === "DELETE") return { ok: true, status: 204 }
      return { ok: true, status: 201, json: async () => ({}) }
    }
    const { app, db } = makeApp({
      requireAuth: true,
      fetchImpl,
      authExtern: { url: "http://auth-x", secret: "secret-123456789012345678901234" },
    })
    const k = db.seedTenant({ slug: "offb", name: "Offb", members: ["bleibt@offb.de", "weg@offb.de"] })
    const res = await asAdmin(request(app).put(`/api/admin/tenants/${k.id}/members`))
      .send({ members: [{ email: "bleibt@offb.de", role: "admin" }] })
    expect(res.status).toBe(200)
    // Entferntes Mitglied → DELETE /internal/users/<email> am Extern-Auth
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("weg%40offb.de"))).toBe(true)
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("bleibt%40offb.de"))).toBe(false)
  })

  it("Rate-Limit auf Redeem: nach 8 Versuchen → 429 (T-351/T-422)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const bogus = generateCode() // gültiges Format, existiert nicht → 404, bis die Drossel greift
    let last
    for (let i = 0; i < 9; i++) {
      last = await asExtern(request(app).post("/api/account/redeem-seat"), "spammer@x.de").send({ code: bogus })
    }
    expect(last.status).toBe(429)
  })

  it("Erfolgreiche Einlösung schreibt ein Audit (seat.redeem, T-351)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "auditseat", name: "AuditSeat" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1 })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({})
    await asExtern(request(app).post("/api/account/redeem-seat"), "neu@auditseat.de").send({ code: gen.body.codes[0].code })
    const audit = await asAdmin(request(app).get(`/api/admin/tenants/${k.id}/audit`))
    expect(audit.body.entries.some((e) => e.action === "seat.redeem")).toBe(true)
  })

  it("GET /api/account/license: eigener Mandant sieht Plan/Laufzeit/Seats (T-171)", async () => {
    const { app, tenant } = makeApp({ requireAuth: true })
    await asAdmin(request(app).patch(`/api/admin/tenants/${tenant.id}/license`))
      .send({ plan: "pro", maxSeats: 2, validUntil: "2027-06-30" })
    await asAdmin(request(app).post(`/api/admin/tenants/${tenant.id}/seat-codes`)).send({})
    const res = await asAdmin(request(app).get("/api/account/license"))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      plan: "pro", maxSeats: 2, validUntil: "2027-06-30", seatsTotal: 2, seatsUsed: 0,
    })
  })

  it("Redeem über max_seats hinaus → 409 (T-352/T-418)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "voll", name: "Voll" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1 })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({ count: 2 })
    expect(gen.body.codes).toHaveLength(2)
    const [c1, c2] = gen.body.codes.map((c) => c.code)

    const first = await asExtern(request(app).post("/api/account/redeem-seat"), "a@voll.de").send({ code: c1 })
    expect(first.status).toBe(201)
    const over = await asExtern(request(app).post("/api/account/redeem-seat"), "b@voll.de").send({ code: c2 })
    expect(over.status).toBe(409) // Seat-Limit erreicht, obwohl der Code existiert
  })

  it("Erster Einlöser eines Mandanten wird Admin, weitere User (T-477)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "boot", name: "Boot" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 2 })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({ count: 2 })
    const [c1, c2] = gen.body.codes.map((c) => c.code)

    await asExtern(request(app).post("/api/account/redeem-seat"), "erst@boot.de").send({ code: c1 })
    await asExtern(request(app).post("/api/account/redeem-seat"), "zweit@boot.de").send({ code: c2 })

    const erst = await asExtern(request(app).get("/api/context"), "erst@boot.de")
    const zweit = await asExtern(request(app).get("/api/context"), "zweit@boot.de")
    expect(erst.body.isTenantAdmin).toBe(true)
    expect(zweit.body.isTenantAdmin).toBe(false)
  })

  it("Abgelaufene Lizenz sperrt Produktzugriff zur Request-Zeit → 403 (T-317)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "abgelaufen", name: "Abgelaufen" })
    // Erst gültig einlösen (Member existiert), dann Lizenz in die Vergangenheit setzen.
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1, validUntil: "2027-12-31" })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({})
    await asExtern(request(app).post("/api/account/redeem-seat"), "m@abgelaufen.de").send({ code: gen.body.codes[0].code })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1, validUntil: "2020-01-01" })

    const res = await asExtern(request(app).get("/api/projects"), "m@abgelaufen.de")
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: "lizenz-abgelaufen" })
  })

  it("Ausgesetzter Mandant sperrt Produktzugriff → 403, Reaktivierung hebt auf (T-346)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "ausgesetzt", name: "Ausgesetzt" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 1, validUntil: "2027-12-31" })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({})
    await asExtern(request(app).post("/api/account/redeem-seat"), "m@ausgesetzt.de").send({ code: gen.body.codes[0].code })

    // aussetzen → gesperrt
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/suspended`)).send({ suspended: true })
    const gesperrt = await asExtern(request(app).get("/api/projects"), "m@ausgesetzt.de")
    expect(gesperrt.status).toBe(403)
    expect(gesperrt.body).toEqual({ error: "mandant-ausgesetzt" })

    // reaktivieren → wieder Zugriff
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/suspended`)).send({ suspended: false })
    const frei = await asExtern(request(app).get("/api/projects"), "m@ausgesetzt.de")
    expect(frei.status).toBe(200)
  })

  it("Einlösen in einen ausgesetzten Mandanten → 403 (T-346)", async () => {
    const { app, db } = makeApp({ requireAuth: true })
    const k = db.seedTenant({ slug: "gesperrt", name: "Gesperrt" })
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/license`)).send({ maxSeats: 2, validUntil: "2027-12-31" })
    const gen = await asAdmin(request(app).post(`/api/admin/tenants/${k.id}/seat-codes`)).send({})
    await asAdmin(request(app).patch(`/api/admin/tenants/${k.id}/suspended`)).send({ suspended: true })
    const res = await asExtern(request(app).post("/api/account/redeem-seat"), "neu@gesperrt.de").send({ code: gen.body.codes[0].code })
    expect(res.status).toBe(403)
  })
})
