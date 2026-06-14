-- 015 — Opt-out für E-Mail-Benachrichtigungen (Roadmap-Mailservice).
--
-- Default: alle Mandanten-Mitglieder bekommen bei Änderungen auf ihren ausgewerteten
-- Strecken eine Mail (neuer/​geänderter/​entfallener Fund). Wer KEINE Mails will, trägt
-- sich hier ein (pro Mandant + E-Mail). Der Versand schließt diese Adressen aus.
--
-- Neue Tabelle → kein ALTER auf großen Tabellen, kein DDL-Lock-Risiko beim Boot.
CREATE TABLE mail_optout (
  tenant_id  uuid NOT NULL,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, email)
);
