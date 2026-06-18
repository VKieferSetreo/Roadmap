// Disclaimer-Akzeptanz: Status + Bestätigung, pro Person + Version.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const asExtern = (req, email = "k@firma.de") =>
  req.set("X-Auth-Email", email).set("X-Auth-Gateway", "extern")

describe("Disclaimer-Akzeptanz", () => {
  it("anfangs nicht akzeptiert, nach POST akzeptiert", async () => {
    const { app } = makeApp({ requireAuth: true })
    const before = await asExtern(request(app).get("/api/account/disclaimer"))
    expect(before.status).toBe(200)
    expect(before.body.accepted).toBe(false)
    expect(before.body.version).toBeTruthy()

    const acc = await asExtern(request(app).post("/api/account/disclaimer"))
    expect(acc.status).toBe(201)

    const after = await asExtern(request(app).get("/api/account/disclaimer"))
    expect(after.body.accepted).toBe(true)
  })

  it("pro Person getrennt (anderer Nutzer = nicht akzeptiert)", async () => {
    const { app } = makeApp({ requireAuth: true })
    await asExtern(request(app).post("/api/account/disclaimer"), "a@firma.de")
    const other = await asExtern(request(app).get("/api/account/disclaimer"), "b@firma.de")
    expect(other.body.accepted).toBe(false)
  })

  it("ohne Login → 401", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/account/disclaimer")
    expect(res.status).toBe(401)
  })
})
