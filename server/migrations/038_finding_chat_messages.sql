-- 038 — Baustellen-Chat pro Fund: zwei Sichtbarkeiten je finding_key.
--   scope='public'   = DB-weit sichtbar (alle Mandanten), Organisation des Autors wird gezeigt.
--   scope='internal' = nur eigener Mandant (tenant_id-Filter), ohne Organisation.
-- Autor wird IMMER serverseitig aus req.ctx gesetzt (nie aus dem Body).

CREATE TABLE IF NOT EXISTS finding_chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_key  text NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('public', 'internal')),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_email text NOT NULL,
  organisation text,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Public: DB-weit, je Fund chronologisch.
CREATE INDEX IF NOT EXISTS finding_chat_public_idx
  ON finding_chat_messages (finding_key, created_at)
  WHERE scope = 'public';

-- Internal: pro Mandant + Fund chronologisch.
CREATE INDEX IF NOT EXISTS finding_chat_internal_idx
  ON finding_chat_messages (tenant_id, finding_key, created_at)
  WHERE scope = 'internal';

-- Gerichtsfestigkeit/Erweiterung: Kontaktdaten-Nachrichten + Manipulationsschutz.
--   kind         = Nachrichtentyp ('text' = normale Nachricht, 'contact' = Kontaktdaten-Karte).
--   contact      = {name?,email?,phone?} bei kind='contact', sonst NULL.
--   content_hash = sha256-Hex über die unveränderlichen Felder (serverseitig bei INSERT gesetzt).
-- Diese Tabelle ist append-only: created_at kommt IMMER aus der DB (now()) und wird nie geändert.
-- Idempotent — ADD COLUMN IF NOT EXISTS, damit die Migration mehrfach laufen darf.
ALTER TABLE finding_chat_messages
  ADD COLUMN IF NOT EXISTS kind         text NOT NULL DEFAULT 'text'
                             CHECK (kind IN ('text', 'contact'));
ALTER TABLE finding_chat_messages
  ADD COLUMN IF NOT EXISTS contact      jsonb;
ALTER TABLE finding_chat_messages
  ADD COLUMN IF NOT EXISTS content_hash text;
