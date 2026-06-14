// Self-Service-Passwortänderung (/api/account/password) — nur externe Kunden-Accounts,
// E-Mail aus dem Gateway (nicht aus dem Body), Proxy auf setreo-auth-extern.

import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import { makeApp } from "./helpers/testApp.js"

const AUTH_EXTERN = { url: "http://setreo-auth-extern:8095", secret: "s".repeat(32) }
const provisionFetch = (status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => ({}) }))

const asExtern = (req, email = "kunde@firma.de") =>
  req.set("X-Auth-Email", email).set("X-Auth-Gateway", "extern")

describe("Account — eigenes Passwort ändern", () => {
  it("externer Nutzer setzt Passwort neu → Provision mit eigener E-Mail + Secret", async () => {
    const fetchImpl = provisionFetch(200)
    const { app } = makeApp({ requireAuth: true, authExtern: AUTH_EXTERN, fetchImpl })
    const res = await asExtern(request(app).post("/api/account/password"))
      .send({ neuesPasswort: "supergeheim123" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe("http://setreo-auth-extern:8095/internal/users")
    expect(opts.headers["x-provision-secret"]).toBe(AUTH_EXTERN.secret)
    expect(JSON.parse(opts.body)).toEqual({ email: "kunde@firma.de", password: "supergeheim123" })
  })

  it("E-Mail kommt aus dem Gateway, NICHT aus dem Body (nur eigenes Konto änderbar)", async () => {
    const fetchImpl = provisionFetch(200)
    const { app } = makeApp({ requireAuth: true, authExtern: AUTH_EXTERN, fetchImpl })
    await asExtern(request(app).post("/api/account/password"), "ich@firma.de")
      .send({ neuesPasswort: "supergeheim123", email: "opfer@firma.de" })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).email).toBe("ich@firma.de")
  })

  it("interner Nutzer (kein extern-Gateway) → 400", async () => {
    const { app } = makeApp({ requireAuth: true, authExtern: AUTH_EXTERN, fetchImpl: provisionFetch() })
    const res = await request(app).post("/api/account/password")
      .set("X-Auth-Email", "team@setreo.de").set("X-Auth-Roles", "admin")
      .send({ neuesPasswort: "supergeheim123" })
    expect(res.status).toBe(400)
  })

  it("zu kurzes Passwort → 400 (kein Auth-Call)", async () => {
    const fetchImpl = provisionFetch()
    const { app } = makeApp({ requireAuth: true, authExtern: AUTH_EXTERN, fetchImpl })
    const res = await asExtern(request(app).post("/api/account/password")).send({ neuesPasswort: "kurz" })
    expect(res.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("ohne konfigurierten Auth-Service → 503", async () => {
    const { app } = makeApp({ requireAuth: true, fetchImpl: provisionFetch() })
    const res = await asExtern(request(app).post("/api/account/password"))
      .send({ neuesPasswort: "supergeheim123" })
    expect(res.status).toBe(503)
  })

  it("/api/context liefert extern=true für externes Gateway", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await asExtern(request(app).get("/api/context"))
    expect(res.body.extern).toBe(true)
  })
})
