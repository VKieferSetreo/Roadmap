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

  return r
}
