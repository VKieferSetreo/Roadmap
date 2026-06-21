// Share-Flow (SPEC-backend-v2): publish ohne/mit PW, public GET, unlock,
// Token-Folge-Requests, revoke/reaktivieren, gestrippte Daten, Rate-Limit, SPA-HTML.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { cityPoints, createRoutedProject, makeApp, midOf } from "./helpers/testApp.js"

const POINTS = cityPoints("Hamburg", "Hannover")

/** Projekt mit Route + 1 Fund + fertiger Analyse. */
async function analysedProject(app, name = "Share-Projekt") {
  const p = await createRoutedProject(app, { name, points: POINTS })
  const mid = midOf(POINTS)
  await request(app).post("/api/obstacles").send({
    kategorie: "bruecke", name: "Share-Brücke", lat: mid.lat, lng: mid.lng,
    attrs: { maxHoeheM: 3.8 },
  })
  const res = await request(app).post(`/api/projects/${p.id}/analysis`)
  expect(res.status).toBe(200)
  return res.body
}

describe("share publish/revoke (gated)", () => {
  it("POST ohne Passwort → ShareInfo, share wird ins Projekt eingebettet", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    const res = await request(app).post(`/api/projects/${p.id}/share`).send({})
    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      url: `https://setreo-cloud.com/setreo/${p.id}`,
      hatPasswort: false,
      createdAt: expect.any(String),
    })

    const fresh = await request(app).get(`/api/projects/${p.id}`)
    expect(fresh.body.share).toEqual(res.body)
    const list = await request(app).get("/api/projects")
    expect(list.body.projects[0].share).toEqual(res.body)
  })

  it("Re-POST ersetzt Passwort / reaktiviert revoked", async () => {
    const { app, db } = makeApp()
    const p = await analysedProject(app)
    await request(app).post(`/api/projects/${p.id}/share`).send({})
    const withPw = await request(app).post(`/api/projects/${p.id}/share`).send({ password: "geheim" })
    expect(withPw.status).toBe(201)
    expect(withPw.body.hatPasswort).toBe(true)
    expect(db.state.shares).toHaveLength(1) // ersetzt, nicht dupliziert
    expect(db.state.shares[0].pw_hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)

    expect((await request(app).delete(`/api/projects/${p.id}/share`)).status).toBe(204)
    expect((await request(app).get(`/api/projects/${p.id}`)).body.share).toBeNull()

    const again = await request(app).post(`/api/projects/${p.id}/share`).send({})
    expect(again.status).toBe(201)
    expect(again.body.hatPasswort).toBe(false)
  })

  it("DELETE ohne aktiven Share → 404; leeres password → 400", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    expect((await request(app).delete(`/api/projects/${p.id}/share`)).status).toBe(404)
    expect((await request(app).post(`/api/projects/${p.id}/share`).send({ password: "" })).status).toBe(400)
  })
})

describe("public share API (/_share, UNGATED)", () => {
  it("ohne Passwort: locked:false + gestrippte Daten (keine Stammdaten)", async () => {
    const { app } = makeApp({ requireAuth: true }) // public bleibt trotzdem offen
    const admin = (req) => req.set("X-Auth-User", "a@setreo.de").set("X-Auth-Roles", "admin")
    const p = await (async () => {
      const created = await admin(request(app).post("/api/projects")).send({ name: "Öffentlich" })
      await admin(request(app).patch(`/api/projects/${created.body.id}`)).send({
        routes: [{ id: "r-1", name: "Hinfahrt", points: POINTS }],
      })
      const mid = midOf(POINTS)
      await admin(request(app).post("/api/obstacles")).send({
        kategorie: "bruecke", name: "Share-Brücke", lat: mid.lat, lng: mid.lng,
        attrs: { maxHoeheM: 3.8 },
      })
      await admin(request(app).post(`/api/projects/${created.body.id}/analysis`))
      await admin(request(app).post(`/api/projects/${created.body.id}/share`)).send({})
      return created.body
    })()

    const res = await request(app).get(`/_share/api/setreo/${p.id}`) // KEIN X-Auth
    expect(res.status).toBe(200)
    expect(res.body.locked).toBe(false)
    const data = res.body.data
    expect(Object.keys(data).sort()).toEqual(
      ["distanzKm", "fahrzeitMin", "findings", "name", "routes", "transport", "updatedAt", "zeitraum"],
    )
    expect(data.name).toBe("Öffentlich")
    // T-223 + #12b: Abmessungen (L/B/H/Gewicht) + zeitraum (Planungs-Datumsfenster für den externen
    // Karten-Zeitstrahl); KEINE weiteren Stammdaten/Admin-Felder.
    expect(Object.keys(data.transport).sort()).toEqual(["breite", "gesamtgewicht", "hoehe", "laenge"])
    expect(Object.keys(data.routes[0]).sort()).toEqual(["farbe", "id", "name", "points"])
    expect(data.findings).toHaveLength(1)
    expect(data.findings[0]).toMatchObject({ routeId: "r-1", routeName: "Hinfahrt" })
  })

  it("Defense-in-Depth (T-156): Projekt↔Share-Tenant-Mismatch → 404 statt Leak", async () => {
    const { app, db } = makeApp()
    const p = await analysedProject(app)
    await request(app).post(`/api/projects/${p.id}/share`).send({})
    // Fragiler Fall: das Projekt gehört plötzlich einem ANDEREN Mandanten als der Share.
    db.state.projects.find((x) => x.id === p.id).tenant_id = "00000000-0000-0000-0000-0000000000ff"
    const res = await request(app).get(`/_share/api/setreo/${p.id}`) // KEIN X-Auth (ungated)
    expect(res.status).toBe(404) // tenant-Guard greift, keine Projekt-/Fund-Daten geleakt
    expect(res.body.data).toBeUndefined()
  })

  it("kein Share / revoked / falscher Tenant-Slug → 404", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    expect((await request(app).get(`/_share/api/setreo/${p.id}`)).status).toBe(404)

    await request(app).post(`/api/projects/${p.id}/share`).send({})
    expect((await request(app).get(`/_share/api/setreo/${p.id}`)).status).toBe(200)
    expect((await request(app).get(`/_share/api/falsch/${p.id}`)).status).toBe(404)
    expect((await request(app).get("/_share/api/setreo/keine-uuid")).status).toBe(404)

    await request(app).delete(`/api/projects/${p.id}/share`)
    expect((await request(app).get(`/_share/api/setreo/${p.id}`)).status).toBe(404)
  })

  it("mit Passwort: locked:true + name; unlock falsch → 401, richtig → token + data", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    await request(app).post(`/api/projects/${p.id}/share`).send({ password: "geheim123" })

    const locked = await request(app).get(`/_share/api/setreo/${p.id}`)
    expect(locked.status).toBe(200)
    expect(locked.body).toEqual({ locked: true, name: "Share-Projekt" })

    const wrong = await request(app)
      .post(`/_share/api/setreo/${p.id}/unlock`)
      .send({ password: "falsch" })
    expect(wrong.status).toBe(401)

    const okRes = await request(app)
      .post(`/_share/api/setreo/${p.id}/unlock`)
      .send({ password: "geheim123" })
    expect(okRes.status).toBe(200)
    expect(okRes.body.token).toMatch(/^[0-9a-f]{64}$/)
    expect(okRes.body.data.name).toBe("Share-Projekt")

    // Folge-GET mit Bearer-Token → entsperrt
    const withToken = await request(app)
      .get(`/_share/api/setreo/${p.id}`)
      .set("Authorization", `Bearer ${okRes.body.token}`)
    expect(withToken.body.locked).toBe(false)

    // kaputter Token → wieder locked
    const badToken = await request(app)
      .get(`/_share/api/setreo/${p.id}`)
      .set("Authorization", "Bearer deadbeef")
    expect(badToken.body.locked).toBe(true)
  })

  it("PW-Wechsel invalidiert alte Tokens", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    await request(app).post(`/api/projects/${p.id}/share`).send({ password: "alt" })
    const unlock = await request(app).post(`/_share/api/setreo/${p.id}/unlock`).send({ password: "alt" })

    await request(app).post(`/api/projects/${p.id}/share`).send({ password: "neu" })
    const stale = await request(app)
      .get(`/_share/api/setreo/${p.id}`)
      .set("Authorization", `Bearer ${unlock.body.token}`)
    expect(stale.body.locked).toBe(true)
  })

  it("Rate-Limit: ab dem 11. unlock-Versuch/min → 429", async () => {
    const { app } = makeApp()
    const p = await analysedProject(app)
    await request(app).post(`/api/projects/${p.id}/share`).send({ password: "geheim" })

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(`/_share/api/setreo/${p.id}/unlock`)
        .send({ password: "falsch" })
      expect(res.status, `Versuch ${i + 1}`).toBe(401)
    }
    const blocked = await request(app)
      .post(`/_share/api/setreo/${p.id}/unlock`)
      .send({ password: "geheim" }) // selbst korrektes PW ist jetzt geblockt
    expect(blocked.status).toBe(429)
  })
})

describe("share SPA-HTML (/:tenantSlug/:projectId)", () => {
  it("fehlendes Share-FE (shareDir leer) → 503-Hinweis", async () => {
    const { app } = makeApp({ shareDir: "/nonexistent-share-dir" })
    const res = await request(app).get("/setreo/3f6f5f6e-0000-4000-8000-000000000000")
    expect(res.status).toBe(503)
    expect(res.body.error).toContain("Share-Frontend")
  })

  it("vendortes Share-FE (Default-Dir) → 200 mit HTML", async () => {
    const { app } = makeApp()
    const res = await request(app).get("/setreo/3f6f5f6e-0000-4000-8000-000000000000")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/html")
  })

  it("ungültiges Pfad-Format / reservierte Slugs fallen durch (404)", async () => {
    const { app } = makeApp()
    expect((await request(app).get("/setreo/keine-uuid")).status).toBe(404)
    expect((await request(app).get("/_share/3f6f5f6e-0000-4000-8000-000000000000")).status).toBe(404)
  })
})
