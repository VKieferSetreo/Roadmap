// Obstacles v3 (SPEC-backend-v3): Rechte-Matrix, Sichtbarkeit (herkunft),
// fachId-Vergabe (Quelle 0100), strenge POST-Validierung, Engine tenant-scoped.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { buildFachId, formatDdmmyy, isIsoDate, todayIso } from "../src/obstaclesRepo.js"
import { cityPoints, makeApp, midOf } from "./helpers/testApp.js"

const asAdmin = (req) => req.set("X-Auth-User", "admin@setreo.de").set("X-Auth-Roles", "admin")
const asUser = (email) => (req) => req.set("X-Auth-User", email).set("X-Auth-Roles", "user")

/** Zweiten Tenant inkl. Mitglied über die Admin-API anlegen. */
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

/** App mit zweitem Tenant kunde-a (Mitglied a@kunde-a.de); setreo-Mitglied: vki@setreo.de. */
async function makeTwoTenantApp() {
  const ctx = makeApp({ requireAuth: true })
  await createTenant(ctx.app, { slug: "kunde-a", name: "Kunde A", members: ["a@kunde-a.de"] })
  return ctx
}

const OBSTACLE = { kategorie: "ampel", name: "Test-Ampel", lat: 50.1, lng: 8.6 }

describe("obstacles v3 — Kunden-POST", () => {
  it("Tenant-Nutzer legt eigenen Eintrag an: Quelle 0100, fachId auto, quelle-Default", async () => {
    const { app, tenant } = await makeTwoTenantApp()
    const res = await asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send(OBSTACLE)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      herkunft: "eigen",
      tenantId: tenant.id,
      quellenId: "0100",
      fachId: buildFachId(1, "0100", todayIso()),
      realerStart: todayIso(),
      quelle: { name: "Eigener Eintrag (Setreo)" },
      demo: false,
      aktiv: true,
    })
    expect(res.body.fachId).toMatch(/^\d{4}0100\d{6}$/)
    expect(res.body.fachId.slice(8)).toBe(formatDdmmyy(todayIso()))
  })

  it("Kontaktdaten (Melder/Ansprechpartner/Telefon) landen im quelle-jsonb", async () => {
    const { app } = await makeTwoTenantApp()
    const res = await asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send({
      ...OBSTACLE,
      kontakt: { melder: " Disponent Müller ", ansprechpartner: "Bauleiter Schmidt", telefon: "0711 123456", quatsch: 42 },
    })
    expect(res.status).toBe(201)
    expect(res.body.quelle).toEqual({
      name: "Eigener Eintrag (Setreo)",
      eigen: true,
      kontakt: { melder: "Disponent Müller", ansprechpartner: "Bauleiter Schmidt", telefon: "0711 123456" },
    })
  })

  it("leere/fehlende Kontaktdaten → kein kontakt-Feld", async () => {
    const { app } = await makeTwoTenantApp()
    const res = await asUser("vki@setreo.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, kontakt: { melder: "  ", telefon: "" } })
    expect(res.status).toBe(201)
    expect(res.body.quelle).toEqual({ name: "Eigener Eintrag (Setreo)", eigen: true })
  })

  it("fachId-Sequenz zählt pro Quelle weiter — auch über Tenant-Grenzen", async () => {
    const { app } = await makeTwoTenantApp()
    const first = await asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send(OBSTACLE)
    const second = await asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send(OBSTACLE)
    const third = await asUser("a@kunde-a.de")(request(app).post("/api/obstacles")).send(OBSTACLE)
    expect(first.body.fachId.slice(0, 4)).toBe("0001")
    expect(second.body.fachId.slice(0, 4)).toBe("0002")
    expect(third.body.fachId.slice(0, 4)).toBe("0003") // INDEX läuft pro Quelle, nicht pro Tenant
  })

  it("realerStart bestimmt das Datums-Segment der fachId", async () => {
    const { app } = await makeTwoTenantApp()
    const res = await asUser("vki@setreo.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, realerStart: "2026-01-01" })
    expect(res.status).toBe(201)
    expect(res.body.fachId).toBe("00010100010126")
    expect(res.body.realerStart).toBe("2026-01-01")
  })

  it("Nutzer ohne Mandanten-Zuordnung → 403 kein-mandant", async () => {
    const { app } = await makeTwoTenantApp()
    const res = await asUser("ghost@nirgendwo.de")(request(app).post("/api/obstacles")).send(OBSTACLE)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: "kein-mandant" })
  })

  it("Admin: ohne global → eigen im aktiven Tenant (X-Tenant), mit global:true → global", async () => {
    const { app } = await makeTwoTenantApp()
    const eigen = await asAdmin(request(app).post("/api/obstacles"))
      .set("X-Tenant", "kunde-a")
      .send(OBSTACLE)
    expect(eigen.status).toBe(201)
    expect(eigen.body.herkunft).toBe("eigen")
    expect(eigen.body.quelle).toEqual({ name: "Eigener Eintrag (Kunde A)", eigen: true })

    const global = await asAdmin(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, global: true })
    expect(global.status).toBe(201)
    expect(global.body).toMatchObject({ herkunft: "global", tenantId: null })
    // globaler Pfad: v2-Semantik, keine 0100-Defaults
    expect(global.body.quellenId).toBeNull()
    expect(global.body.fachId).toBeNull()
    expect(global.body.quelle).toBeNull()
  })

  it("strenge Validierung: name/Bounds/attrs/Datumsfelder", async () => {
    const { app } = await makeTwoTenantApp()
    const post = (body) => asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send(body)

    expect((await post({ ...OBSTACLE, name: "ab" })).status).toBe(400)
    expect((await post({ kategorie: "ampel", lat: 50, lng: 8 })).status).toBe(400) // name fehlt
    expect((await post({ ...OBSTACLE, lat: 95 })).status).toBe(400)
    expect((await post({ ...OBSTACLE, lng: -200 })).status).toBe(400)
    expect((await post({ ...OBSTACLE, attrs: { maxHoeheM: "hoch" } })).status).toBe(400)
    expect((await post({ ...OBSTACLE, gueltigVon: "01.07.2026" })).status).toBe(400)
    expect((await post({ ...OBSTACLE, realerStart: "2026-13-40" })).status).toBe(400)
    expect((await post({ ...OBSTACLE, quellenId: "99" })).status).toBe(400)
    expect((await post({ ...OBSTACLE, fachId: "123" })).status).toBe(400)

    // bool-attrs sind erlaubt (z.B. anmeldungErforderlich, Datenformat-Draft §4)
    const okBool = await post({
      ...OBSTACLE, kategorie: "bahnuebergang",
      attrs: { maxHoeheM: 5.5, anmeldungErforderlich: true },
    })
    expect(okBool.status).toBe(201)
  })
})

describe("obstacles v3 — Sichtbarkeit (GET)", () => {
  it("Tenant sieht global + eigene mit herkunft, fremde Einträge nie", async () => {
    const { app } = await makeTwoTenantApp()
    await asAdmin(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "Globale Ampel", global: true })
    await asUser("vki@setreo.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "Setreo-Ampel" })
    await asUser("a@kunde-a.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "KundeA-Ampel" })

    const setreo = await asUser("vki@setreo.de")(request(app).get("/api/obstacles"))
    expect(setreo.body.obstacles.map((o) => o.name).sort()).toEqual(["Globale Ampel", "Setreo-Ampel"])
    expect(setreo.body.obstacles.find((o) => o.name === "Globale Ampel").herkunft).toBe("global")
    expect(setreo.body.obstacles.find((o) => o.name === "Setreo-Ampel").herkunft).toBe("eigen")

    const kundeA = await asUser("a@kunde-a.de")(request(app).get("/api/obstacles"))
    expect(kundeA.body.obstacles.map((o) => o.name).sort()).toEqual(["Globale Ampel", "KundeA-Ampel"])

    // Nutzer ohne Tenant: nur globale
    const ghost = await asUser("ghost@nirgendwo.de")(request(app).get("/api/obstacles"))
    expect(ghost.body.obstacles.map((o) => o.name)).toEqual(["Globale Ampel"])
  })
})

describe("obstacles v3 — PATCH/DELETE Rechte", () => {
  async function seedEntries(app) {
    const global = await asAdmin(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "Globale Ampel", global: true })
    const setreo = await asUser("vki@setreo.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "Setreo-Ampel" })
    const kundeA = await asUser("a@kunde-a.de")(request(app).post("/api/obstacles"))
      .send({ ...OBSTACLE, name: "KundeA-Ampel" })
    return { global: global.body, setreo: setreo.body, kundeA: kundeA.body }
  }

  it("eigener Tenant-Eintrag: PATCH/DELETE als normaler Nutzer erlaubt", async () => {
    const { app } = await makeTwoTenantApp()
    const { setreo } = await seedEntries(app)
    const patched = await asUser("vki@setreo.de")(request(app).patch(`/api/obstacles/${setreo.id}`))
      .send({ aktiv: false })
    expect(patched.status).toBe(200)
    expect(patched.body.aktiv).toBe(false)
    expect(patched.body.herkunft).toBe("eigen") // tenant-Zuordnung unverändert
    expect((await asUser("vki@setreo.de")(request(app).delete(`/api/obstacles/${setreo.id}`))).status).toBe(204)
  })

  it("fremder Tenant-Eintrag: 404 — kein Existenz-Orakel", async () => {
    const { app } = await makeTwoTenantApp()
    const { kundeA } = await seedEntries(app)
    const patch = await asUser("vki@setreo.de")(request(app).patch(`/api/obstacles/${kundeA.id}`))
      .send({ aktiv: false })
    expect(patch.status).toBe(404)
    expect((await asUser("vki@setreo.de")(request(app).delete(`/api/obstacles/${kundeA.id}`))).status).toBe(404)
    // Admin im fremden Default-Tenant (setreo) ebenfalls 404 — Tenant-Wechsel via X-Tenant nötig
    expect((await asAdmin(request(app).delete(`/api/obstacles/${kundeA.id}`))).status).toBe(404)
    const viaSwitch = await asAdmin(request(app).delete(`/api/obstacles/${kundeA.id}`))
      .set("X-Tenant", "kunde-a")
    expect(viaSwitch.status).toBe(204)
  })

  it("globaler Eintrag: Tenant-Nutzer → 403, admin/roadmap → ok", async () => {
    const { app } = await makeTwoTenantApp()
    const { global } = await seedEntries(app)
    const denied = await asUser("vki@setreo.de")(request(app).patch(`/api/obstacles/${global.id}`))
      .send({ aktiv: false })
    expect(denied.status).toBe(403)
    expect((await asUser("vki@setreo.de")(request(app).delete(`/api/obstacles/${global.id}`))).status).toBe(403)

    const asRoadmap = (req) => req.set("X-Auth-User", "max@setreo.de").set("X-Auth-Roles", "roadmap")
    const patched = await asRoadmap(request(app).patch(`/api/obstacles/${global.id}`)).send({ aktiv: false })
    expect(patched.status).toBe(200)
    expect((await asAdmin(request(app).delete(`/api/obstacles/${global.id}`))).status).toBe(204)
  })
})

describe("obstacles v3 — Engine tenant-scoped", () => {
  it("Kunden-Eintrag wirkt nur im eigenen Tenant, globaler in allen", async () => {
    const { app } = await makeTwoTenantApp()
    const points = cityPoints("Hamburg", "Hannover")
    const mid = midOf(points)

    // identische Projekte in beiden Tenants
    async function routedProject(actor, name) {
      const p = await actor(request(app).post("/api/projects")).send({ name })
      expect(p.status).toBe(201)
      const patched = await actor(request(app).patch(`/api/projects/${p.body.id}`))
        .send({ routes: [{ id: "r-1", name: "Hinfahrt", points }] })
      expect(patched.status).toBe(200)
      return p.body
    }
    const setreoProject = await routedProject(asUser("vki@setreo.de"), "Setreo-Transport")
    const kundeAProject = await routedProject(asUser("a@kunde-a.de"), "KundeA-Transport")

    // Setreo-eigener Eintrag + globaler Eintrag, beide auf der Route
    await asUser("vki@setreo.de")(request(app).post("/api/obstacles")).send({
      kategorie: "bruecke", name: "Setreo-Brücke", lat: mid.lat, lng: mid.lng,
      attrs: { maxHoeheM: 3.8 },
    })
    await asAdmin(request(app).post("/api/obstacles")).send({
      kategorie: "engstelle", name: "Globale Engstelle", lat: mid.lat, lng: mid.lng,
      attrs: { maxBreiteM: 2.8 }, global: true,
    })

    const setreoRun = await asUser("vki@setreo.de")(
      request(app).post(`/api/projects/${setreoProject.id}/analysis`),
    )
    expect(setreoRun.status).toBe(200)
    expect(setreoRun.body.findings.map((f) => f.titel).sort()).toEqual(
      ["Globale Engstelle", "Setreo-Brücke"],
    )

    const kundeARun = await asUser("a@kunde-a.de")(
      request(app).post(`/api/projects/${kundeAProject.id}/analysis`),
    )
    expect(kundeARun.status).toBe(200)
    expect(kundeARun.body.findings.map((f) => f.titel)).toEqual(["Globale Engstelle"])
  })
})

describe("obstaclesRepo — fachId-Bausteine", () => {
  it("formatDdmmyy/buildFachId/isIsoDate", () => {
    expect(formatDdmmyy("2026-01-01")).toBe("010126")
    expect(buildFachId(3, "0009", "2026-01-01")).toBe("00030009010126")
    expect(buildFachId(42, "0100", "2025-12-31")).toBe("00420100311225")
    expect(isIsoDate("2026-02-29")).toBe(false) // kein Schaltjahr
    expect(isIsoDate("2024-02-29")).toBe(true)
    expect(isIsoDate("2026-1-1")).toBe(false)
  })
})
