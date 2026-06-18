// Interne Service-API (auth-extern → roadmap-api): Secret-Gate + Seat-Einlösung + Status.
process.env.AUTH_EXTERN_PROVISION_SECRET = "test-internal-secret-0123456789abc"

import { describe, expect, it } from "vitest"
import request from "supertest"
import { makeApp } from "./helpers/testApp.js"
import { generateSeatCodes } from "../src/seatCodes.js"

const SECRET = process.env.AUTH_EXTERN_PROVISION_SECRET

describe("Internal API (T-185)", () => {
  it("verlangt das Provision-Secret (403 ohne / mit falschem)", async () => {
    const { app } = makeApp()
    expect((await request(app).get("/api/internal/account-status?email=x@y.de")).status).toBe(403)
    expect(
      (await request(app).get("/api/internal/account-status?email=x@y.de").set("x-provision-secret", "falsch")).status,
    ).toBe(403)
  })

  it("account-status + Seat-Einlösung end-to-end", async () => {
    const { app, db, tenant } = makeApp()
    const codes = await generateSeatCodes(db, tenant.id, 1)
    const code = codes[0]

    // vor Einlösung: kein Mandant
    const before = await request(app)
      .get("/api/internal/account-status?email=neu@firma.de")
      .set("x-provision-secret", SECRET)
    expect(before.status).toBe(200)
    expect(before.body.hasTenant).toBe(false)

    // einlösen (E-Mail kommt vom Aufrufer, nicht aus Gateway)
    const redeem = await request(app)
      .post("/api/internal/redeem-seat")
      .set("x-provision-secret", SECRET)
      .send({ email: "neu@firma.de", code })
    expect(redeem.status).toBe(201)
    expect(redeem.body.ok).toBe(true)
    expect(redeem.body.tenant.slug).toBe("setreo")

    // danach: Mandant vorhanden
    const after = await request(app)
      .get("/api/internal/account-status?email=neu@firma.de")
      .set("x-provision-secret", SECRET)
    expect(after.body.hasTenant).toBe(true)
    expect(after.body.tenant.slug).toBe("setreo")
  })

  it("lehnt bereits zugeordnete E-Mail ab (eine Mail = ein Mandant)", async () => {
    const { app, db, tenant } = makeApp()
    const codes = await generateSeatCodes(db, tenant.id, 2)
    await request(app).post("/api/internal/redeem-seat").set("x-provision-secret", SECRET)
      .send({ email: "doppelt@firma.de", code: codes[0] })
    const again = await request(app).post("/api/internal/redeem-seat").set("x-provision-secret", SECRET)
      .send({ email: "doppelt@firma.de", code: codes[1] })
    expect(again.status).toBe(409)
  })
})
