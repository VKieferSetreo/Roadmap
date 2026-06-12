-- 003_v3 — Tenant-Hindernisse, Quellen-Register, Import-Protokoll, Re-Import-Dedupe.
-- Läuft transaktional über scripts/migrate.js (_migrations-Tabelle = Idempotenz).
-- Bewusst simples SQL (keine korrelierten Aggregate — Lesson aus 002, PG-Fehler 42803).

-- ── Tenant-Hindernisse ────────────────────────────────────────────────────────
-- NULL = global (Setreo/Connectoren, alle Mandanten), gesetzt = nur dieser Mandant.

ALTER TABLE obstacles ADD COLUMN tenant_id uuid REFERENCES tenants ON DELETE CASCADE;

CREATE INDEX obstacles_tenant_idx ON obstacles (tenant_id);

-- ── Quellen-Register (docs/HINDERNIS-DATENFORMAT.md §2) ───────────────────────

CREATE TABLE quellen (
  id              text PRIMARY KEY,        -- 4-stellig, z.B. '0009'
  name            text NOT NULL,
  typ             text,                    -- api | datensatz | manuell
  endpoint_url    text,
  abruf_intervall text,                    -- Cron-Ausdruck oder Beschreibung
  letzter_abruf   timestamptz,
  aktiv           boolean NOT NULL DEFAULT true
);

INSERT INTO quellen (id, name, typ, abruf_intervall) VALUES
  ('0001', 'Autobahn-API (verkehr.autobahn.de)', 'api', '0 4 * * *'),
  ('0002', 'BASt SIB-Bauwerke', 'datensatz', 'quartalsweise'),
  ('0003', 'OSM / Overpass', 'api', 'monatlich'),
  ('0009', 'Mobilithek (DATEX II)', 'api', 'täglich'),
  ('0100', 'Kunden-Eintrag (manuell)', 'manuell', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Import-Protokoll (sichtbar machen, was die Connectoren tun) ───────────────

CREATE TABLE import_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle_id   text NOT NULL REFERENCES quellen,
  status      text NOT NULL DEFAULT 'running',  -- running | ok | error
  stats       jsonb NOT NULL DEFAULT '{}',      -- {gefunden, neu, aktualisiert, uebersprungen}
  log         text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX import_runs_started_idx ON import_runs (started_at DESC);

-- ── Dedupe-Anker für Re-Imports ───────────────────────────────────────────────

ALTER TABLE obstacles ADD COLUMN externe_id text;

CREATE UNIQUE INDEX obstacles_quelle_extern_ux ON obstacles (quellen_id, externe_id)
  WHERE externe_id IS NOT NULL;
