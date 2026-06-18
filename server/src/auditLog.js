// Mandanten-Audit-Log: wer hat wann welche Mutation ausgeloest (Compliance/Forensik).
// Fire-and-forget — ein Audit-Fehler darf die eigentliche Aktion NIE blocken.

export async function auditLog(db, { tenantId = null, actorEmail = null, action, detail = null }) {
  try {
    await db.query(
      "INSERT INTO tenant_audit_log (tenant_id, actor_email, action, detail) VALUES ($1, $2, $3, $4)",
      [tenantId, actorEmail, action, detail],
    )
  } catch (err) {
    // bewusst geschluckt — Audit ist Nebenwirkung, nicht kritisch fuer die Aktion
    console.error(`[audit] ${action} fehlgeschlagen: ${err?.message ?? err}`)
  }
}

/** Audit-Row → FE-Shape. */
export function rowToAudit(r) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    actorEmail: r.actor_email,
    action: r.action,
    detail: r.detail,
    at: r.at,
  }
}
