// Share-Links: Passwort-Hashing (scrypt), stateless Unlock-Token (HMAC),
// Share-URL-Bau und ShareInfo-Mapping. Kein Logging von Passwörtern — nie.

import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { toIso } from "./util.js"

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64

/** → "scrypt$<salt-hex>$<hash-hex>" */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex")
  const hash = await scryptAsync(String(password), salt, KEY_LEN)
  return `scrypt$${salt}$${hash.toString("hex")}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false
  const [scheme, salt, hashHex] = stored.split("$")
  if (scheme !== "scrypt" || !salt || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = await scryptAsync(String(password), salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * Stateless Unlock-Token: HMAC-SHA256 über die projectId, Key aus pw_hash +
 * SESSION_SALT. PW-Wechsel oder Revoke+Re-Publish invalidieren alte Tokens.
 */
export function shareToken(projectId, pwHash, sessionSalt) {
  return createHmac("sha256", `${pwHash ?? ""}|${sessionSalt}`)
    .update(String(projectId))
    .digest("hex")
}

export function verifyShareToken(token, projectId, pwHash, sessionSalt) {
  if (typeof token !== "string" || !token) return false
  const expected = Buffer.from(shareToken(projectId, pwHash, sessionSalt))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function buildShareUrl(baseUrl, tenantSlug, projectId) {
  return `${String(baseUrl).replace(/\/+$/, "")}/${tenantSlug}/${projectId}`
}

/** shares-Row → ShareInfo {url, hatPasswort, createdAt} (Contract mit FE). */
export function rowToShareInfo(row, baseUrl, tenantSlug) {
  if (!row || row.revoked_at != null) return null
  return {
    url: buildShareUrl(baseUrl, tenantSlug, row.project_id),
    hatPasswort: row.pw_hash != null,
    createdAt: toIso(row.created_at),
  }
}

/**
 * Mini-Rate-Limiter (in-memory, pro Prozess): max `max` Treffer je Key innerhalb
 * `windowMs`. Reicht für den Share-Unlock; bei Multi-Instanz wäre Redis dran.
 */
export function createRateLimiter({ max = 10, windowMs = 60_000 } = {}) {
  const hits = new Map() // key → { count, windowStart }
  // T-391: Cleanup periodisch + entkoppelt vom Hot-Path (vorher nur im Neu-Key-Zweig → der
  // Counter-Zweig räumte nie auf, und der Inline-Scan lief im Request-Pfad). unref(), damit
  // der Timer weder den Prozess noch die Tests am Beenden hindert.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (now - v.windowStart >= windowMs) hits.delete(k)
  }, windowMs)
  sweep.unref?.()
  return function allow(key, now = Date.now()) {
    const entry = hits.get(key)
    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: now })
      return true
    }
    entry.count += 1
    return entry.count <= max
  }
}
