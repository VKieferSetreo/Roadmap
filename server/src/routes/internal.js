// Interne Service-zu-Service-API für setreo-auth-extern (Gegenrichtung zur Provisionierung).
// auth-extern ruft das aus dem Docker-Netz (http://roadmap-api:8095), NICHT über den Proxy.
// Gate: x-provision-secret (dasselbe Shared-Secret wie die Provisionierung), constant-time.
// Kein Gateway/req.ctx hier — die E-Mail kommt vom vertrauenswürdigen auth-extern (Session-bewiesen).

import { Router } from "express"
import { timingSafeEqual } from "node:crypto"
import { redeemSeatCode } from "../seatCodes.js"
import { getTenantForEmail } from "../tenants.js"
import { ApiError, asyncHandler } from "../util.js"

function secretOk(got, want) {
  if (!want) return false
  const a = Buffer.from(String(got ?? ""))
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function internalRouter({ db, provisionSecret }) {
  const r = Router()

  r.use((req, _res, next) => {
    if (!secretOk(req.get("x-provision-secret"), provisionSecret)) {
      throw new ApiError(403, "Forbidden")
    }
    next()
  })

  /** Hat diese E-Mail bereits einen Mandanten? (entscheidet, ob der Seat-Schritt nötig ist) */
  r.get("/account-status", asyncHandler(async (req, res) => {
    const email = String(req.query.email ?? "").trim().toLowerCase()
    if (!email) throw new ApiError(400, "email erforderlich")
    const t = await getTenantForEmail(db, email)
    res.json({ hasTenant: t != null, tenant: t ? { slug: t.slug, name: t.name } : null })
  }))

  /** Seat-Code einlösen → Mandanten-Zuordnung. E-Mail kommt vom (vertrauenswürdigen) auth-extern. */
  r.post("/redeem-seat", asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase()
    if (!email) throw new ApiError(400, "email erforderlich")
    const result = await redeemSeatCode(db, req.body?.code, email)
    res.status(201).json({ ok: true, ...result })
  }))

  return r
}
