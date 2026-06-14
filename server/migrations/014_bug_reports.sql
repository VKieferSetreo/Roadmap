-- 014 — Bug-Reports: In-App-Fehlermeldungen von Nutzern + Admin-Triage auf /debug.
--
-- Jeder eingeloggte Nutzer kann über den Header-Button (oben rechts) melden, was
-- gerade nicht passt. Wir stempeln serverseitig Meldenden (E-Mail), aktiven
-- Mandanten und Admin-Flag aus req.ctx — der Client kann das nicht fälschen.
-- Der Client liefert nur die freie Beschreibung + den erfassten Kontext-Snapshot
-- (aktuelle View/Route, Datenstatus, App-Version, Browser/Viewport) als jsonb.
--
-- KEIN tenant FK: ein Report soll auch dann bestehen bleiben, wenn der Mandant
-- später gelöscht wird (Triage-Historie überlebt). Daher nur tenant_slug als Text.

CREATE TABLE bug_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,                 -- Meldender (aus req.ctx, serverseitig)
  tenant_slug  text,                          -- aktiver Mandant zum Meldezeitpunkt (Snapshot)
  is_admin     boolean NOT NULL DEFAULT false,
  beschreibung text NOT NULL,                 -- was der Nutzer eingegeben hat
  view_path    text,                          -- Route/View, auf der gemeldet wurde
  kontext      jsonb NOT NULL DEFAULT '{}',   -- Seiten-/Datenstatus, App-Version, Browser, Viewport …
  status       text NOT NULL DEFAULT 'offen', -- offen | in_arbeit | erledigt | verworfen
  notiz        text,                          -- interne Admin-Notiz (Triage)
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz                    -- gesetzt, sobald status in (erledigt, verworfen)
);

CREATE INDEX bug_reports_status_idx ON bug_reports (status, created_at DESC);
CREATE INDEX bug_reports_created_idx ON bug_reports (created_at DESC);
