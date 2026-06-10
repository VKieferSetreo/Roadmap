// Express-App als Factory-Export (supertest-fähig, db/fetch injectable).

import express from "express"
import { authMiddleware } from "./auth.js"
import { createDefaultDb } from "./db.js"
import { createNominatim } from "./external/nominatim.js"
import { createOsrm } from "./external/osrm.js"
import { findingsRouter } from "./routes/findings.js"
import { geoRouter } from "./routes/geo.js"
import { obstaclesRouter } from "./routes/obstacles.js"
import { projectsRouter } from "./routes/projects.js"
import { statsRouter } from "./routes/stats.js"
import { ApiError } from "./util.js"

export const APP_VERSION = "1.0.0"

export function createApp({
  db = createDefaultDb(),
  fetchImpl = globalThis.fetch,
  requireAuth = process.env.REQUIRE_AUTH === "true",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  corridorM = Number(process.env.CORRIDOR_M ?? 120),
} = {}) {
  const nominatim = createNominatim({ fetchImpl, timeoutMs })
  const osrm = createOsrm({ fetchImpl, timeoutMs })

  const app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "20mb" }))

  // IMMER ungated (Docker-HEALTHCHECK, Proxy-Probes)
  app.get("/api/health", async (req, res) => {
    let dbOk = false
    try {
      await db.query("SELECT 1")
      dbOk = true
    } catch {
      // db down → ok:false, aber Endpoint antwortet
    }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, version: APP_VERSION })
  })

  app.use("/api", authMiddleware({ requireAuth }))
  app.use("/api/projects", projectsRouter({ db, deps: { nominatim, osrm }, corridorM }))
  app.use("/api/findings", findingsRouter({ db }))
  app.use("/api/obstacles", obstaclesRouter({ db }))
  app.use("/api/geocode", geoRouter({ db, nominatim }))
  app.use("/api/stats", statsRouter({ db }))

  app.use("/api", (req, res) => res.status(404).json({ error: "Nicht gefunden" }))

  // zentraler Error-Handler (4-Arg-Signatur ist für Express signifikant)
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Ungültiges JSON" })
    }
    console.error(err)
    res.status(500).json({ error: "Interner Fehler" })
  })

  return app
}
