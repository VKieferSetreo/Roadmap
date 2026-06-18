-- 027: Plattform-Analytics (Nutzung/Online-Zeit) — nur Admin (mxk/vki) liest aus.
-- analytics_sessions: vom FE-Heartbeat gepflegt (eine Session = zusammenhängende
--   Aktivität eines Nutzers; größere Pause als die Session-Lücke = neue Session).
-- analytics_events: diskrete Aktionen (z.B. manuelle Auswertung) mit Nutzerbezug.

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  tenant_slug text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  hits        integer NOT NULL DEFAULT 1,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS analytics_sessions_email_idx ON analytics_sessions (email);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_idx ON analytics_sessions (last_seen DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  tenant_slug text,
  typ         text NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_typ_created_idx ON analytics_events (typ, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_email_idx ON analytics_events (email);
