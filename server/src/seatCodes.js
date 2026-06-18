// Seat-Codes: ein Code = ein Seat einer Mandanten-Lizenz.
// Generierung (Setreo-Admin) + Einloesung (Nutzer mit verifiziertem Konto, noch ohne Mandant).
//
// Modell (Vorgabe Max 2026-06-18): pro Seat ein Code. Der Nutzer registriert sich extern,
// verifiziert per Mail, loest dann seinen Code ein. Das belegt den Seat und legt die
// tenant_members-Zuordnung an. Eine E-Mail gehoert genau EINEM Mandanten.

import crypto from "node:crypto"
import { getTenantForEmail } from "./tenants.js"
import { ApiError } from "./util.js"

// Menschen-tippbar: 3 Gruppen a 4 Zeichen, ohne mehrdeutige Zeichen (kein 0/O/1/I/L).
// ~59 Bit Entropie. Einmal-Nutzung + DB-Unique machen Raten praktisch aussichtslos.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const GROUPS = 3
const PER_GROUP = 4

export function generateCode() {
  const bytes = crypto.randomBytes(GROUPS * PER_GROUP)
  const groups = []
  for (let g = 0; g < GROUPS; g++) {
    let s = ""
    for (let i = 0; i < PER_GROUP; i++) s += ALPHABET[bytes[g * PER_GROUP + i] % ALPHABET.length]
    groups.push(s)
  }
  return groups.join("-")
}

/** Eingabe normalisieren: Grossschreibung, nur Alphabet, in 4er-Gruppen. "" wenn ungueltig. */
export function normalizeCode(input) {
  const clean = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (clean.length !== GROUPS * PER_GROUP) return ""
  for (const c of clean) if (!ALPHABET.includes(c)) return ""
  return clean.match(/.{4}/g).join("-")
}

/** count eindeutige Codes fuer einen Mandanten anlegen. Gibt die neuen Codes zurueck. */
export async function generateSeatCodes(db, tenantId, count) {
  const codes = []
  for (let i = 0; i < count; i++) {
    let inserted = false
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = generateCode()
      try {
        await db.query("INSERT INTO seat_codes (tenant_id, code) VALUES ($1, $2)", [tenantId, code])
        codes.push(code)
        inserted = true
      } catch (e) {
        if (e?.code !== "23505") throw e // nur Unique-Kollision neu wuerfeln
      }
    }
    if (!inserted) throw new ApiError(500, "Seat-Code-Generierung fehlgeschlagen (Kollision)")
  }
  return codes
}

/** Seat-Codes eines Mandanten + Belegung (FE-Shape). */
export async function listSeatCodes(db, tenantId) {
  const { rows } = await db.query(
    "SELECT code, used_by_email, used_at FROM seat_codes WHERE tenant_id = $1 ORDER BY created_at ASC, code ASC",
    [tenantId],
  )
  return rows.map((r) => ({ code: r.code, usedBy: r.used_by_email ?? null, usedAt: r.used_at ?? null }))
}

/** Code einloesen: Seat belegen + Mitgliedschaft anlegen, alles in EINER Transaktion. */
export async function redeemSeatCode(db, codeInput, email) {
  const code = normalizeCode(codeInput)
  if (!code) throw new ApiError(400, "Ungueltiges Seat-Code-Format")
  const mail = String(email ?? "").trim().toLowerCase()
  if (!mail) throw new ApiError(401, "Nicht angemeldet")

  return await db.tx(async (q) => {
    const found = await q.query(
      "SELECT sc.id, sc.tenant_id, sc.used_by_email, t.slug, t.name, t.valid_until FROM seat_codes sc JOIN tenants t ON t.id = sc.tenant_id WHERE sc.code = $1",
      [code],
    )
    const sc = found.rows[0]
    if (!sc) throw new ApiError(404, "Seat-Code unbekannt")
    if (sc.used_by_email) throw new ApiError(409, "Seat-Code wurde bereits eingeloest")
    if (sc.valid_until && new Date(sc.valid_until) < startOfToday()) {
      throw new ApiError(403, "Die Lizenz dieses Mandanten ist abgelaufen")
    }

    // Eine E-Mail gehoert genau EINEM Mandanten.
    const existing = await getTenantForEmail(q, mail)
    if (existing) throw new ApiError(409, "Diese E-Mail ist bereits einem Mandanten zugeordnet")

    await q.query("UPDATE seat_codes SET used_by_email = $1, used_at = now() WHERE id = $2", [mail, sc.id])
    await q.query(
      "INSERT INTO tenant_members (tenant_id, email, role, passwort_klar) VALUES ($1, $2, $3, $4)",
      [sc.tenant_id, mail, "user", null],
    )
    return { tenant: { id: sc.tenant_id, slug: sc.slug, name: sc.name } }
  })
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
