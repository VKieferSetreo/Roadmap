// Genehmigungs-Archiv (Archive-App) — INTERN-ONLY Proxy auf die archive-api im
// setreo-net (Max 2026-07-15: Archiv-Layer + Agent-Zugriff nur fuer interne Nutzer,
// externe Mandanten sehen ausschliesslich die Roadmap-Daten).

import { Router } from "express"
import { ApiError, asyncHandler } from "../util.js"

export function archivRouter({ fetchImpl = globalThis.fetch } = {}) {
  const r = Router()
  const base = () => (process.env.ARCHIVE_API_URL || "").replace(/\/+$/, "")

  // Grob-Geometrien aller Strecken sind ~24 MB — 5 min Memory-Cache, damit wiederholte
  // Layer-Toggles nicht jedes Mal durchs Netz proxien.
  let cache = null
  let cacheAt = 0

  r.get("/strecken-geo", asyncHandler(async (req, res) => {
    if (!base()) throw new ApiError(503, "Genehmigungs-Archiv ist nicht angebunden")
    if (req.user?.gateway === "extern") throw new ApiError(403, "Nur für interne Nutzer")
    if (cache && Date.now() - cacheAt < 300_000) return res.json(cache)
    const upstream = await fetchImpl(`${base()}/api/strecken/geo`, {
      headers: { Accept: "application/json", "X-Auth-Email": req.user?.email || "roadmap@intern", "X-Auth-Gateway": "intern" },
      signal: AbortSignal.timeout(30_000),
    })
    if (!upstream.ok) throw new ApiError(502, `Archiv antwortet ${upstream.status}`)
    cache = await upstream.json()
    cacheAt = Date.now()
    res.json(cache)
  }))

  return r
}
