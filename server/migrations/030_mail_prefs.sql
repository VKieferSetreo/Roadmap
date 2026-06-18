-- 030: E-Mail-Benachrichtigungs-Präferenzen je (Mandant, Adresse) — ersetzt das reine
-- Opt-out (mail_optout) durch differenzierte Einstellung: an/aus, Scope (eigene/alle
-- Projekte des Mandanten) und nach welchen Schweregraden gemeldet wird.

CREATE TABLE IF NOT EXISTS mail_prefs (
  tenant_id  uuid NOT NULL,
  email      text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  scope      text NOT NULL DEFAULT 'eigene',        -- 'eigene' | 'alle'
  severities jsonb NOT NULL DEFAULT '["kritisch","warnung","hinweis"]',
  PRIMARY KEY (tenant_id, email)
);

-- Bestehende Opt-outs übernehmen (wer abgemeldet war, bleibt es: enabled=false).
INSERT INTO mail_prefs (tenant_id, email, enabled)
  SELECT tenant_id, email, false FROM mail_optout
  ON CONFLICT (tenant_id, email) DO NOTHING;
