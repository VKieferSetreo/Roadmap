// T-482: öffentliche Datenabdeckung — EINE Quelle für In-App-Board + /roadmap/abdeckung.
// Endpoint MUSS ungated sein (öffentliche Seite ohne Auth) und DARF nur die redaktionelle
// Matrix + Connector-Zahl + Stand liefern, KEINE Mandanten-/Bestandsdaten (Leak-Check).

import request from "supertest"
import { describe, expect, it } from "vitest"
import { ABDECKUNG_DATA, ABDECKUNG_KATS } from "../src/abdeckung.js"
import { makeApp } from "./helpers/testApp.js"

describe("GET /api/abdeckung", () => {
  it("ist ungated (auch bei requireAuth, ohne Auth-Header) und liefert die Matrix", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/abdeckung") // bewusst KEINE Auth-Header
    expect(res.status).toBe(200)
    expect(res.body.kats).toEqual(ABDECKUNG_KATS)
    expect(Object.keys(res.body.data)).toEqual(Object.keys(ABDECKUNG_DATA))
    expect(res.body.data["Bayern"]).toHaveLength(ABDECKUNG_KATS.length)
    expect(typeof res.body.stand).toBe("string")
    expect(typeof res.body.connectoren).toBe("number")
    expect(res.body.hinweis).toMatch(/redaktionell/i) // ehrliche Kennzeichnung
  })

  it("leakt keine Mandanten-/Bestandsdaten (nur erwartete Felder)", async () => {
    const { app } = makeApp({ requireAuth: true })
    const res = await request(app).get("/api/abdeckung")
    expect(Object.keys(res.body).sort()).toEqual(
      ["connectoren", "data", "hinweis", "kats", "stand"],
    )
    const blob = JSON.stringify(res.body).toLowerCase()
    for (const leak of ["email", "tenant", "mandant", "obstacle", "@", "passwort", "token"]) {
      expect(blob).not.toContain(leak)
    }
  })
})
