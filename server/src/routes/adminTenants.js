// Mandanten-Verwaltung — ausschließlich Setreo-Admin (Rolle "admin").
// Slug serverseitig hart validiert (Regex + Reserved-Liste), E-Mail gehört
// immer genau EINEM Tenant (UNIQUE auf tenant_members.email → 409 mit Hinweis).
// Kunden-Accounts werden gegen setreo-auth-extern provisioniert (PUT /internal/users).

import { Router } from "express"
import { requireRole } from "../auth.js"
import { getTenantById, listTenants, rowToTenant, slugError } from "../tenants.js"
import { ApiError, asyncHandler, isUuid } from "../util.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LEN = 10

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
    res.json(rowToTenant(rows[0], await memberEmails(db, rows[0].id), await projectCount(db, rows[0].id)))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const n = await projectCount(db, req.params.id)
    if (n > 0) throw new ApiError(409, `Mandant hat noch ${n} Projekt(e) — erst löschen/verschieben`)
    const result = await db.query("DELETE FROM tenants WHERE id = $1", [req.params.id])
    if (result.rowCount === 0) throw new ApiError(404, "Mandant nicht gefunden")
    res.status(204).end()
  }))

  /** Ersetzt die Mitgliederliste komplett (E-Mails lowercase, dedupliziert). */
  r.put("/:id/members", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const tenant = await getTenantById(db, req.params.id)
    if (!tenant) throw new ApiError(404, "Mandant nicht gefunden")

    const raw = req.body?.emails
    if (!Array.isArray(raw)) throw new ApiError(400, "emails muss ein Array sein")
    const emails = [...new Set(raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    for (const email of emails) {
      if (!EMAIL_RE.test(email)) throw new ApiError(400, `ungültige E-Mail: ${email}`)
    }

    // Ein Nutzer gehört genau einem Tenant → Konflikte VOR dem Ersetzen melden
    const conflicts = await db.query(
      "SELECT email FROM tenant_members WHERE email = ANY($1::text[]) AND tenant_id <> $2",
      [emails, tenant.id],
    )
    if (conflicts.rows.length) {
      const list = conflicts.rows.map((c) => c.email).join(", ")
      throw new ApiError(409, `bereits einem anderen Mandanten zugeordnet: ${list}`)
    }

    await db.tx(async (q) => {
      await q.query("DELETE FROM tenant_members WHERE tenant_id = $1", [tenant.id])
      for (const email of emails) {
        await q.query("INSERT INTO tenant_members (tenant_id, email) VALUES ($1, $2)", [tenant.id, email])
      }
    })
    res.json(rowToTenant(tenant, emails, await projectCount(db, tenant.id)))
  }))

  /** Kunden-Nutzer anlegen: Konto in setreo-auth-extern provisionieren (Upsert,
   *  setzt bei Bestand das Passwort neu) + Mitgliedschaft im Mandanten eintragen. */
  r.post("/:id/users", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Mandant nicht gefunden")
    const tenant = await getTenantById(db, req.params.id)
    if (!tenant) throw new ApiError(404, "Mandant nicht gefunden")
    if (!authExtern?.url || !authExtern?.secret) {
      throw new ApiError(503, "Externer Auth-Service nicht konfiguriert")
    }

    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    const password = typeof req.body?.password === "string" ? req.body.password : ""
    if (!EMAIL_RE.test(email)) throw new ApiError(400, `ungültige E-Mail: ${email || "(leer)"}`)
    if (password.length < MIN_PASSWORD_LEN) {
      throw new ApiError(400, `Passwort muss mindestens ${MIN_PASSWORD_LEN} Zeichen haben`)
    }

    // Ein Nutzer gehört genau einem Tenant — Fremd-Zuordnung blocken BEVOR provisioniert wird
    const conflict = await db.query(
      "SELECT email FROM tenant_members WHERE email = $1 AND tenant_id <> $2",
      [email, tenant.id],
    )
    if (conflict.rows.length) {
      throw new ApiError(409, `${email} ist bereits einem anderen Mandanten zugeordnet`)
    }

    let resp
    try {
      resp = await fetchImpl(`${authExtern.url}/internal/users`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-provision-secret": authExtern.secret,
        },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new ApiError(502, "Auth-Service (extern) nicht erreichbar")
    }
    if (resp.status === 422) {
      throw new ApiError(400, "Passwort vom Auth-Service abgelehnt (Mindestlänge)")
    }
    if (!resp.ok) throw new ApiError(502, `Auth-Service-Fehler (${resp.status})`)
    const created = resp.status === 201

    const already = await db.query(
      "SELECT email FROM tenant_members WHERE email = $1 AND tenant_id = $2",
      [email, tenant.id],
    )
    if (!already.rows.length) {
      await db.query("INSERT INTO tenant_members (tenant_id, email) VALUES ($1, $2)", [tenant.id, email])
    }
    res.status(created ? 201 : 200).json({
      email,
      created,
      tenant: rowToTenant(tenant, await memberEmails(db, tenant.id), await projectCount(db, tenant.id)),
    })
  }))

  return r
}

async function memberEmails(db, tenantId) {
  const { rows } = await db.query(
    "SELECT tenant_id, email FROM tenant_members ORDER BY email ASC",
  )
  return rows.filter((m) => m.tenant_id === tenantId).map((m) => m.email)
}

async function projectCount(db, tenantId) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM projects WHERE tenant_id = $1",
    [tenantId],
  )
  return Number(rows[0]?.n ?? 0)
}
