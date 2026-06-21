// Eigenes Konto: Self-Service-Passwortänderung + Seat-Code-Einlösung.
//
// Passwortänderung: NUR für externe Kunden-Accounts (Login über setreo-auth-extern).
// Interne Setreo-Konten (Hub/setreo-auth) verwalten ihr Passwort dort, nicht hier.
//
// Sicherheit: die E-Mail kommt aus req.ctx (vom Proxy gestempelt, nicht fälschbar) —
// der Client kann NUR sein EIGENES Passwort setzen / NUR sich selbst einen Seat zuweisen.
// Beide Routen laufen ohne requireTenant (der einlösende Nutzer hat noch keinen Mandanten).

import { Router } from "express"
import { redeemSeatCode } from "../seatCodes.js"
import { ApiError, asyncHandler } from "../util.js"

const MIN_PASSWORD_LEN = 10 // identisch zu adminTenants (setreo-auth-extern-Mindestlänge)

// Aktuelle Disclaimer-Version. Erhöhen, wenn der Haftungstext sich ändert → der Nutzer
// muss dann erneut bestätigen (PK email+version in disclaimer_acceptances, Migration 031).
const DISCLAIMER_VERSION = "1"

export function accountRouter({ db, fetchImpl = globalThis.fetch, authExtern = null }) {
  const r = Router()

  /** Eigenes Passwort ändern — nur externe Kunden-Accounts. */
  r.post("/password", asyncHandler(async (req, res) => {
    if (req.user?.gateway !== "extern") {
      throw new ApiError(400, "Das Passwort dieses Kontos wird über den Setreo-Hub verwaltet")
    }
    const email = req.ctx?.email
    if (!email) throw new ApiError(401, "Nicht angemeldet")
    if (!authExtern?.url || !authExtern?.secret) {
      throw new ApiError(503, "Externer Auth-Service nicht konfiguriert")
    }

    const neu = typeof req.body?.neuesPasswort === "string" ? req.body.neuesPasswort : ""
    if (neu.length < MIN_PASSWORD_LEN) {
      throw new ApiError(400, `Passwort muss mindestens ${MIN_PASSWORD_LEN} Zeichen haben`)
    }

    let resp
    try {
      resp = await fetchImpl(`${authExtern.url}/internal/users`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-provision-secret": authExtern.secret,
        },
        // email aus req.ctx (nicht aus dem Body) → nur das eigene Konto änderbar.
        body: JSON.stringify({ email, password: neu }),
        // T-396: harte Obergrenze — ein hängender Auth-Service darf den Request nicht offen halten.
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      throw new ApiError(502, "Auth-Service (extern) nicht erreichbar")
    }
    if (resp.status === 422) {
      throw new ApiError(400, "Passwort vom Auth-Service abgelehnt (Mindestlänge)")
    }
    if (!resp.ok) throw new ApiError(502, `Auth-Service-Fehler (${resp.status})`)

    res.json({ ok: true })
  }))

  /** Seat-Code einlösen → Mandanten-Zugang. Für verifizierte Konten ohne Mandant.
   *  E-Mail aus req.ctx (Gateway), nicht aus dem Body → nur sich selbst zuweisbar. */
  r.post("/redeem-seat", asyncHandler(async (req, res) => {
    const email = req.ctx?.email
    if (!email) throw new ApiError(401, "Nicht angemeldet")
    const result = await redeemSeatCode(db, req.body?.code, email)
    res.status(201).json({ ok: true, ...result })
  }))

  /** Disclaimer-Status: hat der Nutzer die aktuelle Version akzeptiert? */
  r.get("/disclaimer", asyncHandler(async (req, res) => {
    const email = req.ctx?.email
    if (!email) throw new ApiError(401, "Nicht angemeldet")
    const { rows } = await db.query(
      "SELECT 1 FROM disclaimer_acceptances WHERE email = $1 AND version = $2",
      [email, DISCLAIMER_VERSION],
    )
    res.json({ version: DISCLAIMER_VERSION, accepted: rows.length > 0 })
  }))

  /** Disclaimer akzeptieren — pro Person + Version (idempotent). T-416: Herkunft (IP, via
   *  trust-proxy = echte Client-IP) + Mandantenkontext mitschreiben → belastbarer Nachweis. */
  r.post("/disclaimer", asyncHandler(async (req, res) => {
    const email = req.ctx?.email
    if (!email) throw new ApiError(401, "Nicht angemeldet")
    await db.query(
      `INSERT INTO disclaimer_acceptances (email, version, ip, tenant_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email, version) DO NOTHING`,
      [email, DISCLAIMER_VERSION, req.ip ?? null, req.ctx?.tenant?.id ?? null],
    )
    res.status(201).json({ ok: true, version: DISCLAIMER_VERSION })
  }))

  /** Eigene Mandanten-Lizenz: Plan, Laufzeit, Seat-Belegung (für die Lizenz-Anzeige des Kunden). */
  r.get("/license", asyncHandler(async (req, res) => {
    const tenant = req.ctx?.tenant
    if (!tenant) throw new ApiError(403, "kein-mandant")
    const { rows } = await db.query(
      "SELECT plan, max_seats, valid_until FROM tenants WHERE id = $1",
      [tenant.id],
    )
    const lic = rows[0] ?? {}
    const { rows: s } = await db.query(
      "SELECT count(*)::int AS total, count(used_by_email)::int AS used FROM seat_codes WHERE tenant_id = $1",
      [tenant.id],
    )
    res.json({
      plan: lic.plan ?? "standard",
      maxSeats: lic.max_seats ?? 0,
      validUntil: lic.valid_until ?? null,
      seatsTotal: s[0]?.total ?? 0,
      seatsUsed: s[0]?.used ?? 0,
    })
  }))

  return r
}
