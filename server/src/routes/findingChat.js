// Baustellen-Chat pro Fund — zwei Sichtbarkeiten je finding_key.
//   scope='public'   = DB-weit sichtbar (alle Mandanten), Organisation des Autors wird gezeigt.
//   scope='internal' = nur eigener Mandant (tenant_id-Filter), Organisation ausgeblendet.
// Autor (E-Mail) + Mandant kommen IMMER aus req.ctx — NIE aus dem Body.
//
// GERICHTSFESTIGKEIT: Diese Tabelle ist append-only und manipulationssicher.
//   - created_at kommt IMMER aus der DB (now()), nie vom Client, nie änderbar.
//   - Es gibt KEINE UPDATE/DELETE-Route auf body/created_at/kind/contact einer Nachricht.
//   - Jede Nachricht trägt content_hash = sha256 über ihre unveränderlichen Felder,
//     serverseitig bei INSERT gesetzt (siehe computeContentHash).

import { createHash } from "node:crypto"
import { Router } from "express"
import { ApiError, asyncHandler, toIso } from "../util.js"

const MAX_BODY = 2000

function isScope(s) {
  return s === "public" || s === "internal"
}

/** contact-Karte aus dem Body lesen+trimmen; NULL wenn kein Feld gesetzt. */
function normalizeContact(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const pick = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  const c = {
    name: pick(raw.name),
    email: pick(raw.email),
    phone: pick(raw.phone),
  }
  // mind. ein Feld gesetzt, sonst keine gültige Kontakt-Karte
  if (c.name === undefined && c.email === undefined && c.phone === undefined) return null
  const out = {}
  if (c.name !== undefined) out.name = c.name
  if (c.email !== undefined) out.email = c.email
  if (c.phone !== undefined) out.phone = c.phone
  return out
}

// sha256-Hex über die unveränderlichen Felder einer Nachricht.
// Reihenfolge fix: id|finding_key|scope|tenant_id|author_email|kind|body|JSON(contact)|created_at_iso.
function computeContentHash(row) {
  const createdIso = toIso(row.created_at)
  const parts = [
    row.id,
    row.finding_key,
    row.scope,
    row.tenant_id,
    row.author_email,
    row.kind,
    row.body ?? "",
    row.contact == null ? "" : JSON.stringify(row.contact),
    createdIso,
  ]
  return createHash("sha256").update(parts.join("|")).digest("hex")
}

/** row → FindingChatMessage (camelCase). organisation nur bei public. */
function rowToMessage(row, email) {
  return {
    id: row.id,
    findingKey: row.finding_key,
    scope: row.scope,
    authorEmail: row.author_email,
    organisation: row.scope === "public" ? (row.organisation ?? null) : null,
    body: row.body,
    kind: row.kind ?? "text",
    contact: row.contact ?? null,
    createdAt: toIso(row.created_at),
    mine: row.author_email === email,
  }
}

export function findingChatRouter({ db }) {
  const r = Router()

  // Nachrichten eines Funds in einem Scope (chronologisch).
  r.get("/", asyncHandler(async (req, res) => {
    const findingKey = req.query?.findingKey
    const scope = req.query?.scope
    if (typeof findingKey !== "string" || !findingKey.trim()) {
      throw new ApiError(400, "findingKey erforderlich")
    }
    if (!isScope(scope)) throw new ApiError(400, "scope ungültig")

    const params = [findingKey, scope]
    let sql =
      "SELECT * FROM finding_chat_messages WHERE finding_key = $1 AND scope = $2"
    if (scope === "internal") {
      params.push(req.ctx.tenant.id)
      sql += " AND tenant_id = $3"
    }
    sql += " ORDER BY created_at ASC"

    const { rows } = await db.query(sql, params)
    res.json({ messages: rows.map((row) => rowToMessage(row, req.ctx.email)) })
  }))

  // Präsenz: Anzahl Nachrichten je Scope + neuester Zeitstempel (für Unread-Punkt).
  // latest = MAX(created_at) über die für den User sichtbaren Zeilen
  //          (public DB-weit + internal des eigenen Mandanten), als ISO oder null.
  r.get("/presence", asyncHandler(async (req, res) => {
    const findingKey = req.query?.findingKey
    if (typeof findingKey !== "string" || !findingKey.trim()) {
      throw new ApiError(400, "findingKey erforderlich")
    }
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE scope = 'public')                          AS public,
         COUNT(*) FILTER (WHERE scope = 'internal' AND tenant_id = $2)     AS internal,
         MAX(created_at) FILTER (
           WHERE scope = 'public' OR (scope = 'internal' AND tenant_id = $2)
         )                                                                 AS latest
       FROM finding_chat_messages
       WHERE finding_key = $1`,
      [findingKey, req.ctx.tenant.id],
    )
    const row = rows[0] ?? { public: 0, internal: 0, latest: null }
    res.json({
      public: Number(row.public),
      internal: Number(row.internal),
      latest: row.latest ? toIso(row.latest) : null,
    })
  }))

  // Nachricht senden — Autor + Mandant aus req.ctx, organisation = Mandantenname.
  //   kind='text'    → body Pflicht (trim, max 2000).
  //   kind='contact' → contact = {name?,email?,phone?} (mind. eins gesetzt), body optional (Notiz).
  // content_hash wird nach dem INSERT serverseitig über die unveränderlichen Felder gesetzt.
  r.post("/", asyncHandler(async (req, res) => {
    const findingKey = req.body?.findingKey
    const scope = req.body?.scope
    if (typeof findingKey !== "string" || !findingKey.trim()) {
      throw new ApiError(400, "findingKey erforderlich")
    }
    if (!isScope(scope)) throw new ApiError(400, "scope ungültig")

    const kind = req.body?.kind == null ? "text" : req.body.kind
    if (kind !== "text" && kind !== "contact") throw new ApiError(400, "kind ungültig")

    const rawBody = typeof req.body?.body === "string" ? req.body.body.trim() : ""
    let body = rawBody
    let contact = null

    if (kind === "contact") {
      contact = normalizeContact(req.body?.contact)
      if (!contact) throw new ApiError(400, "contact erfordert mind. ein Feld (name/email/phone)")
      // body ist hier optional (kurze Notiz) — leerer String wird NULL gespeichert.
      if (!body) body = null
      if (body && body.length > MAX_BODY) throw new ApiError(400, `body max ${MAX_BODY} Zeichen`)
    } else {
      if (!body) throw new ApiError(400, "body erforderlich")
      if (body.length > MAX_BODY) throw new ApiError(400, `body max ${MAX_BODY} Zeichen`)
    }

    // 1) Einfügen — created_at kommt aus dem DB-Default (now()), nie vom Client.
    const { rows } = await db.query(
      `INSERT INTO finding_chat_messages
         (finding_key, scope, tenant_id, author_email, organisation, body, kind, contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        findingKey.trim(),
        scope,
        req.ctx.tenant.id,
        req.ctx.email,
        req.ctx.tenant.name,
        body,
        kind,
        contact,
      ],
    )
    const row = rows[0]

    // 2) content_hash über die unveränderlichen Felder (inkl. DB-created_at) berechnen
    //    und einmalig nachschreiben — dies ist der einzige erlaubte UPDATE und rührt
    //    body/created_at/kind/contact NICHT an.
    const contentHash = computeContentHash(row)
    await db.query(
      "UPDATE finding_chat_messages SET content_hash = $2 WHERE id = $1",
      [row.id, contentHash],
    )
    row.content_hash = contentHash

    res.status(201).json(rowToMessage(row, req.ctx.email))
  }))

  return r
}
