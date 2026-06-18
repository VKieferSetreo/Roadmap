-- 034 — Mandanten-Audit-Log (T-158): wer hat wann welche Mandanten-/Lizenz-/Mitglieder-Mutation
-- ausgeloest. Compliance + Incident-Forensik. KEIN FK auf tenants(id) — der Eintrag soll eine
-- Mandanten-Loeschung ueberleben (sonst verschwinde gerade der "wer hat geloescht"-Beleg).
CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  actor_email text,
  action      text NOT NULL,
  detail      text,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_audit_log_tenant_idx ON tenant_audit_log (tenant_id, at DESC);
