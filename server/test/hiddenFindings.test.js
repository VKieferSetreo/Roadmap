// Ausgeblendete Funde: hide/unhide pro Projekt (stabiler finding_key), Ausschluss aus
// Auswertung + Share, Admin-Triage-Liste, Grund-Validierung.
// Tests 1-3 laufen im Dev-Modus (anonymer Admin auf Tenant setreo, keine Header nötig).

import { randomUUID } from "node:crypto"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createProject, makeApp } from "./helpers/testApp.js"

/** Einen Fund direkt in den Fake-State legen (ohne echte Analyse). */
function seedFinding(db, projectId, over = {}) {
  const row = {
    id: randomUUID(),
    project_id: projectId,
    obstacle_id: "ob-1",
    route_id: "r-1",
    route_name: "Hinfahrt",
    kategorie: "baustelle",
    severity: "warnung",
    titel: "Test-Baustelle",
    beschreibung: "",
    lat: 50, lng: 8, km: 12.3,
    detail: {},
    quelle: { name: "Autobahn GmbH · A3" },
    created_at: new Date().toISOString(),
    ...over,
  }
  db.state.findings.push(row)
  return row
}

describe("hidden findings", () => {
  it("hide → Fund kommt mit hidden:true + Grund; unhide → wieder sichtbar", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app)
    seedFinding(db, p.id)

    const before = await request(app).get(`/api/projects/${p.id}`)
    expect(before.status).toBe(200)
    const f = before.body.findings[0]
    expect(f.key).toBe("ob-1|r-1")
    expect(f.hidden).toBeFalsy()

    const hide = await request(app)
      .post(`/api/projects/${p.id}/findings/hide`)
      .send({ findingKey: f.key, obstacleId: "ob-1", grund: "falsche_fahrbahn", kontext: { quelleName: "Autobahn GmbH · A3" } })
    expect(hide.status).toBe(200)
    expect(hide.body).toEqual({ ok: true })

    const after = await request(app).get(`/api/projects/${p.id}`)
    expect(after.body.findings[0].hidden).toBe(true)
    expect(after.body.findings[0].hiddenGrund).toBe("falsche_fahrbahn")

    const unhide = await request(app)
      .post(`/api/projects/${p.id}/findings/unhide`)
      .send({ findingKey: f.key })
    expect(unhide.status).toBe(200)
    const back = await request(app).get(`/api/projects/${p.id}`)
    expect(back.body.findings[0].hidden).toBeFalsy()
  })

  it("Grund-Validierung: unbekannt → 400; sonstiges ohne Text → 400", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app)
    seedFinding(db, p.id)
    const base = () => request(app).post(`/api/projects/${p.id}/findings/hide`)
    expect((await base().send({ findingKey: "ob-1|r-1", grund: "quatsch" })).status).toBe(400)
    expect((await base().send({ findingKey: "ob-1|r-1", grund: "sonstiges" })).status).toBe(400)
    expect((await base().send({ findingKey: "ob-1|r-1", grund: "sonstiges", grundText: "weil" })).status).toBe(200)
  })

  it("Admin-Triage listet ausgeblendete Funde + Zähler je Grund/Quelle", async () => {
    const { app, db } = makeApp()
    const p = await createProject(app)
    seedFinding(db, p.id)
    await request(app).post(`/api/projects/${p.id}/findings/hide`)
      .send({ findingKey: "ob-1|r-1", grund: "falsche_daten", kontext: { quelleName: "Autobahn GmbH · A3" } })

    const list = await request(app).get("/api/admin/hidden-findings")
    expect(list.status).toBe(200)
    expect(list.body.eintraege).toHaveLength(1)
    expect(list.body.eintraege[0]).toMatchObject({ grund: "falsche_daten", projektName: "Testprojekt" })
    expect(list.body.grundZaehler.falsche_daten).toBe(1)
    expect(list.body.quelleZaehler["Autobahn GmbH · A3"]).toBe(1)
  })

  it("Admin-Liste nur für Admin (Tenant-Nutzer → 403)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/admin/hidden-findings")
      .set("X-Auth-User", "vki@setreo.de").set("X-Auth-Roles", "user")
    expect(res.status).toBe(403)
  })
})
