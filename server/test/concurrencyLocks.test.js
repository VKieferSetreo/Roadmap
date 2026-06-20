// S4 Concurrency-Locks: Optimistic-Version-Lock auf projects (T-466) +
// Ein-laufender-Analyse-Lock je Projekt (T-467) inkl. Stale-Reclaim.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { cityPoints, createProject, createRoutedProject, makeApp } from "./helpers/testApp.js"

describe("Concurrency-Locks", () => {
  it("PATCH mit veralteter version → 409, ohne version → blind (T-466)", async () => {
    const { app } = makeApp()
    const p = await createProject(app) // version 0
    expect(p.version).toBe(0)

    const first = await request(app).patch(`/api/projects/${p.id}`).send({ name: "A", version: 0 })
    expect(first.status).toBe(200)
    expect(first.body.version).toBe(1) // inkrementiert

    const stale = await request(app).patch(`/api/projects/${p.id}`).send({ name: "B", version: 0 })
    expect(stale.status).toBe(409) // veraltet → kein stiller Overwrite

    const blind = await request(app).patch(`/api/projects/${p.id}`).send({ name: "C" })
    expect(blind.status).toBe(200) // Alt-Client ohne version → abwärtskompatibel
    expect(blind.body.version).toBe(2)
  })

  it("Analyse 409 bei laufendem Run, reclaimt stale (T-467)", async () => {
    const { app, db } = makeApp()
    const p = await createRoutedProject(app, { points: cityPoints("Berlin", "Hamburg") })

    // frischer 'running'-Run → neue Analyse wird abgewiesen
    db.state.runs.push({ id: "r1", project_id: p.id, status: "running", started_at: new Date().toISOString() })
    const blocked = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(blocked.status).toBe(409)

    // denselben Run 20 Min alt machen → Stale-Reclaim erlaubt den neuen Lauf
    db.state.runs[0].started_at = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const ok = await request(app).post(`/api/projects/${p.id}/analysis`)
    expect(ok.status).toBe(200)
    expect(db.state.runs[0].status).toBe("error") // reclaimt
  })
})
