-- 028: Quellen-Vorschläge (Nutzer schlägt neue Datenquelle vor → Triage auf /debug)
--      + Screenshot-Spalte für Bug-Reports (automatischer Seiten-Screenshot beim Melden).

CREATE TABLE IF NOT EXISTS source_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,                 -- Vorschlagender (aus req.ctx, serverseitig)
  tenant_slug  text,                          -- aktiver Mandant zum Zeitpunkt (Snapshot)
  url          text NOT NULL,                 -- URL der vorgeschlagenen Quelle
  beschreibung text NOT NULL,                 -- wozu / was die Quelle liefert
  status       text NOT NULL DEFAULT 'offen', -- offen | in_arbeit | erledigt | verworfen
  notiz        text,                          -- interne Admin-Notiz (Triage)
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS source_requests_status_idx ON source_requests (status, created_at DESC);

-- Bug-Report bekommt optionalen Seiten-Screenshot (data:image-JPEG, base64).
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS screenshot text;
