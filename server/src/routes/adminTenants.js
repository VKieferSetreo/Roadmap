// Mandanten-Verwaltung — ausschließlich Setreo-Admin (Rolle "admin").
// Slug serverseitig hart validiert (Regex + Reserved-Liste), E-Mail gehört
// immer genau EINEM Tenant (UNIQUE auf tenant_members.email → 409 mit Hinweis).
// Kunden-Accounts werden gegen setreo-auth-extern provisioniert (PUT /internal/users).
// KEIN Klartext-Passwort in dieser DB (DSGVO, T-151) — Passwoerter liegen ausschliesslich
// gehasht in setreo-auth-extern. Ein gesetztes Passwort wird dort (re)provisioniert, nicht hier gespeichert.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { generateSeatCodes, listSeatCodes } from "../seatCodes.js"
import { getTenantById, listTenants, rowToTenant, slugError, tenantMembers } from "../tenants.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LEN = 10

/** Kunden-Konto in setreo-auth-extern anlegen/aktualisieren (Upsert). Wirft ApiError. */
async function provisionExtern({ authExtern, fetchImpl, email, password }) {
  if (!authExtern?.url || !authExtern?.secret) {
    throw new ApiError(503, "Externer Auth-Service nicht konfiguriert")
  }
  let resp
  try {
    resp = await fetchImpl(`${authExtern.url}/internal/users`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-provision-secret": authExtern.secret },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new ApiError(502, "Auth-Service (extern) nicht erreichbar")
  }
  if (resp.status === 422) throw new ApiError(400, "Passwort vom Auth-Service abgelehnt (Mindestlänge)")
  if (!resp.ok) throw new ApiError(502, `Auth-Service-Fehler (${resp.status})`)
  return resp.status === 201 // created
}

export function adminTenantsRouter({ db, fetchImpl = globalThis.fetch, authExtern = null }) {
  const r = Router()
  r.use(requireRole("admin"))

  r.get("/", asyncHandler(async (req, res) => {
    res.json({ tenants: await listTenants(db) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const slug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase() : ""
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const err = slugError(slug)
    if (err) throw new ApiError(400, err)
    if (!name) throw new ApiError(400, "name erforderlich")

    const existing = await db.query("SELECT id, slug, name FROM tenants WHERE slug = $1", [slug])
    if (existing.rows[0]) throw new ApiError(409, `slug "${slug}" existiert bereits`)

    const { rows } = await db.query(
      "INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING *",
      [slug, name],
    )
    res.status(201).json(rowToTenant(rows[0], [], 0))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    if (!name) throw new ApiError(400, "name erforderlich")
    const { rows } = await db.query(
      "UPDATE tenants SET name = $2 WHERE id = $1 RETURNING *",
      [req.params.id, name],
    )
    if (!rows[0]) throw new ApiError(404, "Mandant nicht gefunden")
    res.json(rowToTenant(rows[0], await tenantMembers(db, rows[0].id), await projectCount(db, rows[0].id)))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const n = await projectCount(db, req.params.id)
    if (n > 0) throw new ApiError(409, `Mandant hat noch ${n} Projekt(e) — erst löschen/verschieben`)
    const result = await db.query("DELETE FROM tenants WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Mandant nicht gefunden")
    res.status(204).end()
  }))

  /** Zentraler Speichern-Button der Mandanten-Seite: setzt die komplette Nutzerliste eines
   *  Mandanten. Body: { members: [{ email, role, password }] }.
   *  - Neue Mitglieder MÜSSEN ein Passwort haben (nur-mit-Passwort) → werden in extern provisioniert.
   *  - Geändertes Passwort → re-provisioniert; Klartext wird gespeichert (Admin-Einsicht).
   *  - Bestehende ohne Passwort-Eingabe (interne Hub-Mitglieder) bleiben unangetastet, nur Rolle.
   *  - Nicht mehr gelistete Mitglieder werden entfernt. */
  r.put("/:id/members", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const tenant = await getTenantById(db, req.params.id)
    if (!tenant) throw new ApiError(404, "Mandant nicht gefunden")

    const raw = Array.isArray(req.body?.members) ? req.body.members : null
    if (!raw) throw new ApiError(400, "members muss ein Array sein")

    // normalisieren + validieren
    const seen = new Set()
    const incoming = []
    for (const m of raw) {
      const email = String(m?.email ?? "").trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw new ApiError(400, `ungültige E-Mail: ${email || "(leer)"}`)
      if (seen.has(email)) throw new ApiError(400, `E-Mail doppelt: ${email}`)
      seen.add(email)
      const role = m?.role === "admin" ? "admin" : "user"
      const password = typeof m?.password === "string" ? m.password : ""
      incoming.push({ email, role, password })
    }

    // E-Mail gehört genau einem Mandanten → Fremd-Zuordnung blocken
    if (incoming.length) {
      const conflicts = await db.query(
        "SELECT email FROM tenant_members WHERE email = ANY($1::text[]) AND tenant_id <> $2",
        [incoming.map((m) => m.email), tenant.id],
      )
      if (conflicts.rows.length) {
        throw new ApiError(409, `bereits einem anderen Mandanten zugeordnet: ${conflicts.rows.map((c) => c.email).join(", ")}`)
      }
    }

    const currentByEmail = new Map((await tenantMembers(db, tenant.id)).map((m) => [m.email, m]))

    // Provisionierung (externe Calls) VOR der DB-Transaktion — schlägt eine fehl, wird nichts geschrieben.
    // Gesetztes Passwort → in setreo-auth-extern (re)provisionieren (Hash), NICHT hier speichern.
    // Leeres Passwort = unverändert (bestehende Mitglieder behalten ihren Login).
    for (const m of incoming) {
      if (m.password) {
        if (m.password.length < MIN_PASSWORD_LEN) {
          throw new ApiError(400, `Passwort für ${m.email}: mindestens ${MIN_PASSWORD_LEN} Zeichen`)
        }
        await provisionExtern({ authExtern, fetchImpl, email: m.email, password: m.password })
      } else if (!currentByEmail.has(m.email)) {
        // neuer Eintrag ohne Passwort → nicht erlaubt (nur-mit-Passwort)
        throw new ApiError(400, `Neuer Nutzer ${m.email} braucht ein Passwort`)
      }
    }

    await db.tx(async (q) => {
      await q.query("DELETE FROM tenant_members WHERE tenant_id = $1", [tenant.id])
      for (const m of incoming) {
        await q.query(
          "INSERT INTO tenant_members (tenant_id, email, role) VALUES ($1, $2, $3)",
          [tenant.id, m.email, m.role],
        )
      }
    })
    res.json(rowToTenant(tenant, await tenantMembers(db, tenant.id), await projectCount(db, tenant.id)))
  }))

  /** Einzelnen Kunden-Nutzer anlegen/aktualisieren (Kompatibilität + Direkt-Anlage). */
  r.post("/:id/users", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const tenant = await getTenantById(db, req.params.id)
    if (!tenant) throw new ApiError(404, "Mandant nicht gefunden")

    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    const password = typeof req.body?.password === "string" ? req.body.password : ""
    const role = req.body?.role === "admin" ? "admin" : "user"
    if (!EMAIL_RE.test(email)) throw new ApiError(400, `ungültige E-Mail: ${email || "(leer)"}`)
    if (password.length < MIN_PASSWORD_LEN) {
      throw new ApiError(400, `Passwort muss mindestens ${MIN_PASSWORD_LEN} Zeichen haben`)
    }

    const conflict = await db.query(
      "SELECT email FROM tenant_members WHERE email = $1 AND tenant_id <> $2",
      [email, tenant.id],
    )
    if (conflict.rows.length) {
      throw new ApiError(409, `${email} ist bereits einem anderen Mandanten zugeordnet`)
    }

    const created = await provisionExtern({ authExtern, fetchImpl, email, password })

    const already = await db.query(
      "SELECT email FROM tenant_members WHERE email = $1 AND tenant_id = $2",
      [email, tenant.id],
    )
    if (already.rows.length) {
      await db.query(
        "UPDATE tenant_members SET role = $3 WHERE tenant_id = $1 AND email = $2",
        [tenant.id, email, role],
      )
    } else {
      await db.query(
        "INSERT INTO tenant_members (tenant_id, email, role) VALUES ($1, $2, $3)",
        [tenant.id, email, role],
      )
    }
    res.status(created ? 201 : 200).json({
      email,
      created,
      tenant: rowToTenant(tenant, await tenantMembers(db, tenant.id), await projectCount(db, tenant.id)),
    })
  }))

  /** Lizenz setzen: Plan, Seats (Anzahl Codes), Laufzeit. Buchhaltung rechnet extern. */
  r.patch("/:id/license", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const plan = typeof req.body?.plan === "string" && req.body.plan.trim() ? req.body.plan.trim() : "standard"
    const maxSeats = Number(req.body?.maxSeats)
    if (!Number.isInteger(maxSeats) || maxSeats < 0 || maxSeats > 1000) {
      throw new ApiError(400, "maxSeats muss eine ganze Zahl 0..1000 sein")
    }
    const validUntil = req.body?.validUntil ? String(req.body.validUntil).slice(0, 10) : null
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      throw new ApiError(400, "validUntil muss YYYY-MM-DD sein")
    }
    const { rows } = await db.query(
      "UPDATE tenants SET plan = $2, max_seats = $3, valid_until = $4 WHERE id = $1 RETURNING id, slug, name, plan, max_seats, valid_until",
      [req.params.id, plan, maxSeats, validUntil],
    )
    if (!rows[0]) throw new ApiError(404, "Mandant nicht gefunden")
    res.json(rows[0])
  }))

  /** Seat-Codes generieren: auf max_seats auffüllen, oder body.count zusätzliche. */
  r.post("/:id/seat-codes", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const tenant = await getTenantById(db, req.params.id)
    if (!tenant) throw new ApiError(404, "Mandant nicht gefunden")
    const existing = await listSeatCodes(db, tenant.id)
    let count
    if (req.body?.count != null) {
      count = Number(req.body.count)
      if (!Number.isInteger(count) || count < 1 || count > 1000) {
        throw new ApiError(400, "count muss eine ganze Zahl 1..1000 sein")
      }
    } else {
      const { rows } = await db.query("SELECT max_seats FROM tenants WHERE id = $1", [tenant.id])
      count = Math.max(0, Number(rows[0]?.max_seats ?? 0) - existing.length)
    }
    if (count > 0) await generateSeatCodes(db, tenant.id, count)
    res.status(201).json({ codes: await listSeatCodes(db, tenant.id) })
  }))

  /** Lizenz + Seat-Codes eines Mandanten (für die Backoffice-/Lizenz-Seite). */
  r.get("/:id/seat-codes", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const { rows } = await db.query(
      "SELECT plan, max_seats, valid_until FROM tenants WHERE id = $1",
      [req.params.id],
    )
    if (!rows[0]) throw new ApiError(404, "Mandant nicht gefunden")
    res.json({
      license: {
        plan: rows[0].plan ?? "standard",
        maxSeats: rows[0].max_seats ?? 0,
        validUntil: rows[0].valid_until ?? null,
      },
      codes: await listSeatCodes(db, req.params.id),
    })
  }))

  return r
}

async function projectCount(db, tenantId) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM projects WHERE tenant_id = $1",
    [tenantId],
  )
  return Number(rows[0]?.n ?? 0)
}
