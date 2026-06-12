// Gemeinsame Test-Helfer: App-Factory (FakeDb + Default-Tenant "setreo"),
// Offline-fetch, Stadt-zu-Stadt-Punktlisten für Multi-Routen-Tests.

import request from "supertest"
import { expect } from "vitest"
import { createApp } from "../../src/app.js"
import { resolveOrt } from "../../src/engine/cities.js"
import { buildPolyline } from "../../src/engine/fallback.js"
import { createFakeDb } from "./fakeDb.js"

/** fetch-Mock: alles offline → Provider-Fallbacks greifen. */
export const offlineFetch = async () => {
  throw new Error("offline")
}

export const jsonResponse = (payload) => ({ ok: true, json: async () => payload })

/**
 * App mit FakeDb + Default-Tenant setreo (Member vki@setreo.de) — wie nach
 * Migration 002. Dev-Modus ohne Header = anonymer Admin auf Tenant setreo.
 */
export function makeApp(overrides = {}) {
  const db = createFakeDb()
  const tenant = db.seedTenant({ slug: "setreo", name: "Setreo", members: ["vki@setreo.de"] })
  const app = createApp({
    db,
    fetchImpl: offlineFetch,
    requireAuth: false,
    sessionSalt: "test-salt",
    shareBaseUrl: "https://setreo-cloud.com",
    ...overrides,
  })
  return { db, app, tenant }
}

/** Deterministische Punktliste zwischen zwei Städten (Fallback-Polyline). */
export function cityPoints(start, ziel) {
  return buildPolyline([resolveOrt(start), resolveOrt(ziel)])
}

export const midOf = (points) => points[Math.floor(points.length / 2)]

export async function createProject(app, name = "Testprojekt") {
  const res = await request(app).post("/api/projects").send({ name })
  expect(res.status).toBe(201)
  return res.body
}

/** Projekt mit einer Route (Punkte) anlegen — Standard-Setup vieler Tests. */
export async function createRoutedProject(app, { name = "Testprojekt", points, routeName = "Hinfahrt" }) {
  const p = await createProject(app, name)
  const res = await request(app).patch(`/api/projects/${p.id}`).send({
    routes: [{ id: "r-1", name: routeName, fileName: "strecke.gpx", points }],
  })
  expect(res.status).toBe(200)
  return res.body
}
