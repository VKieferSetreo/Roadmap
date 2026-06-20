// DSGVO auf Mandanten-Ebene: Voll-Export (Art. 15/20) + Anonymisierung (Art. 17).
//
// Max-Entscheid: ANONYMISIEREN statt Hard-Delete — Projekte/Statistik bleiben anonym erhalten,
// alle personenbezogenen Daten (Mails, Namen, eigene Einträge, IPs) werden entfernt/pseudonymisiert.
// Das ist reines UPDATE-in-place (kein Tenant-/Projekt-Delete) → keine FK-Kaskaden-Konflikte,
// die gerichtsfeste Fund-Chat-Kette bleibt erhalten (nur Autor pseudonymisiert), idempotent.
//
// Pseudonym = deterministischer sha256-Prefix der Mail → derselbe Nutzer behält über Läufe
// hinweg dasselbe Pseudonym (stabile Statistik-Joins) und ein zweiter Lauf ist ein No-op.

import { tenantMembers } from "./tenants.js"

/** SQL-Ausdruck: deterministisches, idempotentes Pseudonym aus einer Mail-Spalte (sha256, pg-builtin). */
const ANON = (col) =>
  `('anon-' || substr(encode(sha256(convert_to(lower(${col}), 'UTF8')), 'hex'), 1, 16))`

/**
 * Voll-Export eines Mandanten (Art. 15/20) als ein JSON-Objekt. STRIKT tenant-gefiltert
 * (nie tenant_id IS NULL — globale/amtliche obstacles gehören nicht dem Mandanten).
 * pw_hash wird NICHT exportiert (Zugangsgeheimnis, kein berechtigtes Auskunftsinteresse).
 */
export async function exportTenant(db, tenant) {
  const id = tenant.id
  const slug = tenant.slug
  const rows = (sql, p) => db.query(sql, p).then((r) => r.rows)

  const members = await rows("SELECT email, role, created_at FROM tenant_members WHERE tenant_id = $1", [id])
  const projects = await rows(
    "SELECT id, name, status, routes, transport, zeitraum, created_by, distanz_km, fahrzeit_min, archived_at, created_at, updated_at FROM projects WHERE tenant_id = $1",
    [id],
  )
  const projectIds = projects.map((p) => p.id)
  const findings = projectIds.length
    ? await rows(
        "SELECT project_id, kategorie, severity, titel, beschreibung, lat, lng, km, detail, strassen_ref, quelle, zustaendig, gueltig_von, gueltig_bis FROM findings WHERE project_id = ANY($1::uuid[])",
        [projectIds],
      )
    : []
  const obstacles = await rows(
    "SELECT id, kategorie, name, beschreibung, lat, lng, strassen_ref, zustaendig, quelle, geom, gueltig_von, gueltig_bis, created_at FROM obstacles WHERE tenant_id = $1",
    [id],
  )
  const folders = await rows("SELECT id, parent_id, name, sort_order, created_at FROM folders WHERE tenant_id = $1", [id])
  const seatCodes = await rows("SELECT code, used_by_email, used_at, created_at FROM seat_codes WHERE tenant_id = $1", [id])
  const findingChat = await rows(
    "SELECT finding_key, scope, author_email, organisation, body, created_at FROM finding_chat_messages WHERE tenant_id = $1",
    [id],
  )
  const bugReports = await rows(
    "SELECT id, email, beschreibung, view_path, status, created_at FROM bug_reports WHERE tenant_slug = $1",
    [slug],
  )
  const sourceRequests = await rows(
    "SELECT id, email, url, beschreibung, status, created_at FROM source_requests WHERE tenant_slug = $1",
    [slug],
  )
  const auditLog = await rows(
    "SELECT actor_email, action, detail, at FROM tenant_audit_log WHERE tenant_id = $1::uuid ORDER BY at",
    [id],
  )

  return {
    schemaVersion: 1,
    tenant: {
      id: tenant.id, slug: tenant.slug, name: tenant.name,
      plan: tenant.plan, maxSeats: tenant.max_seats, validUntil: tenant.valid_until, createdAt: tenant.created_at,
    },
    members, projects, findings, obstacles, folders, seatCodes,
    findingChat, bugReports, sourceRequests, auditLog,
    // Bewusst NICHT enthalten: pw_hash (Geheimnis), globale obstacles (tenant_id IS NULL, Fremddaten),
    // bug_reports.screenshot (base64-Seiten-JPEG, kann Dritt-PII zeigen), geocode/route_cache (global geteilt).
  }
}

/**
 * Mandanten-Anonymisierung (Art. 17). PHASE 0 (vor der Tx): externe Auth-Konten sperren +
 * Sessions killen. Danach EIN db.tx mit reinen UPDATEs/DELETEs (idempotent, FK-sicher).
 * `deactivate(email)` ist optional (intern-only/Tests → übersprungen).
 */
export async function anonymizeTenant(db, tenant, { deactivate = null } = {}) {
  const id = tenant.id
  const slug = tenant.slug
  const members = await tenantMembers(db, id)
  const emails = members.map((m) => m.email)

  // PHASE 0: externe Konten deaktivieren BEVOR die DB-Mails pseudonymisiert werden.
  if (deactivate) {
    for (const email of emails) {
      try { await deactivate(email) } catch { /* 502/404 → DB-Anonymisierung trotzdem fortsetzen */ }
    }
  }

  await db.tx(async (q) => {
    // Tenant-eigene obstacles: Kontakt-PII (quelle.kontakt) + Freitext + Roh-Dump raus.
    // WICHTIG: verhindert PII-Re-Injection in findings (Engine kopiert obstacle.quelle bei Re-Analyse).
    await q.query(
      "UPDATE obstacles SET quelle = quelle - 'kontakt', zustaendig = NULL, name = NULL, beschreibung = NULL, roh = NULL WHERE tenant_id = $1",
      [id],
    )
    // findings der Tenant-Projekte: kopierter Kontakt-Sink + zustaendig raus (Routen/Maße bleiben).
    await q.query(
      "UPDATE findings SET quelle = quelle - 'kontakt', zustaendig = NULL WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = $1)",
      [id],
    )
    // projects: Ersteller-Mail pseudonymisieren (Struktur/Routen/Statistik bleiben).
    await q.query(`UPDATE projects SET created_by = ${ANON("created_by")} WHERE tenant_id = $1 AND created_by IS NOT NULL`, [id])
    // hidden_findings: Ausblendender pseudonymisieren.
    await q.query(
      `UPDATE hidden_findings SET hidden_by = ${ANON("hidden_by")} WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = $1) AND hidden_by IS NOT NULL`,
      [id],
    )
    // shares: Ersteller-Mail pseudonymisieren, Passwort-Hash entfernen.
    await q.query(`UPDATE shares SET created_by = ${ANON("created_by")}, pw_hash = NULL WHERE tenant_id = $1`, [id])
    // folders: Namen (ggf. Kunden-/Personenbezug) neutralisieren.
    await q.query("UPDATE folders SET name = '[anonymisiert]' WHERE tenant_id = $1", [id])
    // finding_chat (gerichtsfest → anonymisieren, NICHT löschen): Autor/Org/Body raus.
    await q.query(
      `UPDATE finding_chat_messages SET author_email = ${ANON("author_email")}, organisation = NULL, body = '[anonymisiert]' WHERE tenant_id = $1`,
      [id],
    )
    // seat_codes: Einlöser-Mail pseudonymisieren (Seat-Struktur bleibt).
    await q.query(`UPDATE seat_codes SET used_by_email = ${ANON("used_by_email")} WHERE tenant_id = $1 AND used_by_email IS NOT NULL`, [id])
    // tenant_members: Login-Mails pseudonymisieren (Zugang ist via Phase 0 ohnehin gesperrt).
    await q.query(`UPDATE tenant_members SET email = ${ANON("email")} WHERE tenant_id = $1`, [id])
    // Reine Mail-Präferenzen (kein Statistikwert) → entfernen.
    await q.query("DELETE FROM mail_prefs WHERE tenant_id = $1", [id])
    await q.query("DELETE FROM mail_optout WHERE tenant_id = $1", [id])
    // FK-lose Tabellen: über Mitglied-Mails bzw. tenant_slug matchen (kein CASCADE-Pfad).
    if (emails.length) {
      await q.query(`UPDATE disclaimer_acceptances SET email = ${ANON("email")}, ip = NULL WHERE email = ANY($1::text[])`, [emails])
    }
    await q.query(
      `UPDATE bug_reports SET email = ${ANON("email")}, beschreibung = '[anonymisiert]', notiz = NULL, screenshot = NULL, kontext = '{}'::jsonb WHERE tenant_slug = $1`,
      [slug],
    )
    await q.query(`UPDATE source_requests SET email = ${ANON("email")}, beschreibung = '[anonymisiert]', notiz = NULL WHERE tenant_slug = $1`, [slug])
    await q.query(`UPDATE analytics_sessions SET email = ${ANON("email")}, user_agent = NULL WHERE tenant_slug = $1`, [slug])
    await q.query(`UPDATE analytics_events SET email = ${ANON("email")}, meta = '{}'::jsonb WHERE tenant_slug = $1`, [slug])
    await q.query(`UPDATE tenant_audit_log SET actor_email = ${ANON("actor_email")}, detail = NULL WHERE tenant_id = $1::uuid`, [id])
    // Tenant selbst: Firmenname neutralisieren (Statistik/Struktur bleibt, slug bewusst unverändert).
    await q.query("UPDATE tenants SET name = '[anonymisiert]' WHERE id = $1", [id])
  })

  return { anonymizedMembers: emails.length }
}
