// Tenant-Helfer: Slug-Validierung (inkl. Reserved-Liste), Lookups, Tenant-Liste.
// Statisches SQL — der FakeDb der Tests dispatcht auf diese Strings.

/** Pfad-Präfixe, die nie ein Tenant-Slug sein dürfen (Share-URL-Raum + Infrastruktur). */
export const RESERVED_SLUGS = ["c", "api", "admin", "assets", "auth", "_share"]

export const SLUG_RE = /^[a-z0-9-]{2,40}$/

/** → null wenn ok, sonst deutscher Fehlertext. */
export function slugError(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return "slug muss aus [a-z0-9-] bestehen (2–40 Zeichen)"
  }
  if (RESERVED_SLUGS.includes(slug)) return `slug "${slug}" ist reserviert`
  return null
}

export async function getTenantBySlug(db, slug) {
  const { rows } = await db.query("SELECT id, slug, name FROM tenants WHERE slug = $1", [slug])
  return rows[0] ?? null
}

export async function getTenantById(db, id) {
  const { rows } = await db.query("SELECT id, slug, name FROM tenants WHERE id = $1", [id])
  return rows[0] ?? null
}

/** Tenant eines Nutzers über tenant_members (E-Mail lowercase). */
export async function getTenantForEmail(db, email) {
  const { rows } = await db.query(
    "SELECT t.id, t.slug, t.name, t.valid_until, t.suspended_at FROM tenants t JOIN tenant_members m ON m.tenant_id = t.id WHERE m.email = $1",
    [String(email).toLowerCase()],
  )
  return rows[0] ?? null
}

/** Volle Tenant-Shape-Liste (mitglieder + projekte) — Admin-Liste + Tenant-Switcher. */
export async function listTenants(db) {
  const tenants = await db.query(
    `SELECT t.id, t.slug, t.name, t.created_at, t.suspended_at,
       (SELECT count(*)::int FROM projects p WHERE p.tenant_id = t.id) AS projekte
     FROM tenants t ORDER BY t.created_at ASC`,
  )
  const byTenant = await membersByTenant(db)
  return tenants.rows.map((t) => rowToTenant(t, byTenant.get(t.id) ?? []))
}

/** Map tenant_id → [{email, role, passwort}] (alle Mandanten). */
export async function membersByTenant(db) {
  // T-426: letzten Login je Mitglied mitliefern (LEFT JOIN auf das jüngste analytics_sessions.last_seen).
  const { rows } = await db.query(
    `SELECT m.tenant_id, m.email, m.role, ls.last_seen
       FROM tenant_members m
       LEFT JOIN (SELECT email, MAX(last_seen) AS last_seen FROM analytics_sessions GROUP BY email) ls
         ON ls.email = m.email
      ORDER BY m.email ASC`,
  )
  const map = new Map()
  for (const m of rows) {
    if (!map.has(m.tenant_id)) map.set(m.tenant_id, [])
    map.get(m.tenant_id).push(rowToMember(m))
  }
  return map
}

/** Mitglieder eines Mandanten als [{email, role, passwort}]. */
export async function tenantMembers(db, tenantId) {
  return (await membersByTenant(db)).get(tenantId) ?? []
}

/** tenant_members-Row → FE-Member-Shape. Kein Klartext-Passwort mehr (DSGVO) —
 *  Passwörter liegen ausschließlich gehasht in setreo-auth-extern. */
export function rowToMember(row) {
  return {
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null, // T-426: letzter Login
  }
}

/** Tenant-Shape exakt wie im FE-Contract: {id, slug, name, mitglieder, projekte}.
 *  mitglieder = [{email, role, passwort}]. */
export function rowToTenant(row, mitglieder = [], projekte = row.projekte ?? 0) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mitglieder,
    projekte: Number(projekte),
    suspended: Boolean(row.suspended_at), // T-346
  }
}
