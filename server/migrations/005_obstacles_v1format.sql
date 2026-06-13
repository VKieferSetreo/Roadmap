-- 005 — Hindernis-Datenformat v1.0 (docs/HINDERNIS-DATENFORMAT.md).
-- Additiv & nicht-brechend: alle neuen Spalten nullable/defaulted, Bestand bleibt gültig.
-- Versorgt die Cron-Job-Schreibfunktion (API/_lib/db.mjs) mit den Zielspalten.

-- ── obstacles: Befristung, Geometrie, Straßenbezug, Provenienz/Cluster, Lebenszyklus, Roh ──
ALTER TABLE obstacles
  ADD COLUMN IF NOT EXISTS befristung        text NOT NULL DEFAULT 'temporaer'
             CHECK (befristung IN ('dauerhaft','temporaer')),
  ADD COLUMN IF NOT EXISTS geom              jsonb,
  ADD COLUMN IF NOT EXISTS richtung          text NOT NULL DEFAULT 'beide'
             CHECK (richtung IN ('beide','hin','rueck')),
  ADD COLUMN IF NOT EXISTS strassenklasse    text CHECK (strassenklasse IN ('A','B','L','K','G','sonstige')),
  ADD COLUMN IF NOT EXISTS baulasttraeger    text CHECK (baulasttraeger IN ('bund','land','kreis','kommune')),
  ADD COLUMN IF NOT EXISTS vnk               text,
  ADD COLUMN IF NOT EXISTS nnk               text,
  ADD COLUMN IF NOT EXISTS station_von       text,
  ADD COLUMN IF NOT EXISTS station_bis       text,
  ADD COLUMN IF NOT EXISTS zeitfenster       jsonb,
  ADD COLUMN IF NOT EXISTS roh               jsonb,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'bestaetigt'
             CHECK (status IN ('gemeldet','bestaetigt','aufgehoben')),
  ADD COLUMN IF NOT EXISTS manuell_korrigiert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cluster_id        uuid,
  ADD COLUMN IF NOT EXISTS is_master         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rangscore         numeric,
  ADD COLUMN IF NOT EXISTS confidence        numeric,
  ADD COLUMN IF NOT EXISTS abgerufen_am      timestamptz;

CREATE INDEX IF NOT EXISTS obstacles_cluster_idx      ON obstacles (cluster_id);
CREATE INDEX IF NOT EXISTS obstacles_master_aktiv_idx ON obstacles (is_master, aktiv);
CREATE INDEX IF NOT EXISTS obstacles_strklasse_idx    ON obstacles (strassenklasse);

-- ── kategorie um 'sperrung' erweitern (CHECK neu setzen) ──
ALTER TABLE obstacles DROP CONSTRAINT IF EXISTS obstacles_kategorie_check;
ALTER TABLE obstacles ADD CONSTRAINT obstacles_kategorie_check CHECK (kategorie IN
  ('bruecke','engstelle','baustelle','sperrung','gewicht','bahnuebergang','kreisverkehr','ampel','steigung','tunnel'));

-- ── quellen: Tier + Provenienz (Priorisierung) ──
ALTER TABLE quellen
  ADD COLUMN IF NOT EXISTS tier        text CHECK (tier IN ('T0','T1','T2','T3','T4','T5','T6')),
  ADD COLUMN IF NOT EXISTS provenienz  text CHECK (provenienz IN ('amtlich','aggregator','crowdsourced','kommerziell')),
  ADD COLUMN IF NOT EXISTS lizenz      text,
  ADD COLUMN IF NOT EXISTS ansprechpartner text;
