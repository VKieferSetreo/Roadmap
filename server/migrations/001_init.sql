-- 001_init — Grundschema Roadmap-Backend.
-- gen_random_uuid(): Postgres 13+ (Core), kein PostGIS — Managed-PG-kompatibel.

CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('entwurf', 'analyse', 'fertig')),
  route_input     jsonb NOT NULL,
  transport       jsonb NOT NULL,
  zeitraum        jsonb NOT NULL DEFAULT '{}',
  route_geometry  jsonb NOT NULL DEFAULT '[]',
  distanz_km      numeric,
  fahrzeit_min    int,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  obstacle_id  uuid,
  kategorie    text NOT NULL CHECK (kategorie IN
    ('bruecke','engstelle','baustelle','gewicht','bahnuebergang','kreisverkehr','ampel','steigung','tunnel')),
  severity     text NOT NULL CHECK (severity IN ('kritisch','warnung','hinweis')),
  titel        text,
  beschreibung text,
  lat          double precision,
  lng          double precision,
  km           numeric,
  detail       jsonb DEFAULT '{}',
  strassen_ref text,
  gueltig_von  date,
  gueltig_bis  date,
  quelle       jsonb,
  zustaendig   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX findings_project_id_idx ON findings (project_id);

-- Hindernis-Stammdaten: vorbereitet für echte Daten (Import-Endpoint), Demo-Datensatz via demo=true.
CREATE TABLE obstacles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie    text NOT NULL CHECK (kategorie IN
    ('bruecke','engstelle','baustelle','gewicht','bahnuebergang','kreisverkehr','ampel','steigung','tunnel')),
  name         text,
  beschreibung text,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  strassen_ref text,
  zustaendig   text,
  quelle       jsonb,
  -- attrs-Schlüssel: maxHoeheM, maxBreiteM, maxGewichtT, maxAchslastT, steigungPct, radiusM, restbreiteM …
  attrs        jsonb NOT NULL DEFAULT '{}',
  gueltig_von  date,
  gueltig_bis  date,
  aktiv        boolean NOT NULL DEFAULT true,
  demo         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX obstacles_lat_idx ON obstacles (lat);
CREATE INDEX obstacles_lng_idx ON obstacles (lng);
CREATE INDEX obstacles_kategorie_idx ON obstacles (kategorie);

CREATE TABLE analysis_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('running','done','error')),
  engine_version text,
  provider       jsonb,
  stats          jsonb,
  error          text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE INDEX analysis_runs_project_id_idx ON analysis_runs (project_id);

CREATE TABLE geocode_cache (
  query        text PRIMARY KEY,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  display_name text,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE route_cache (
  key        text PRIMARY KEY,
  geometry   jsonb NOT NULL,
  distanz_km numeric,
  dauer_min  numeric,
  provider   text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
