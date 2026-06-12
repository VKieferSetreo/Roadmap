-- 002_v2 — Tenants, Shares, Multi-Strecken, Achslasten-Array.
-- Läuft transaktional über scripts/migrate.js (_migrations-Tabelle = Idempotenz).
-- Daten-Migration im selben Step: Default-Tenant, route_input/route_geometry → routes[],
-- transport-Umbau auf achslasten[].

-- ── Neue Tabellen ─────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- url-tauglich; reserved-Slugs (c, api, admin, assets, auth, _share) werden
  -- zusätzlich serverseitig hart validiert (src/tenants.js).
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_members (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email      text NOT NULL UNIQUE, -- ein Nutzer gehört genau einem Tenant
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_members_tenant_id_idx ON tenant_members (tenant_id);

CREATE TABLE shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pw_hash    text, -- null = ohne Passwort; Format scrypt$<salt>$<hash> (node:crypto)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX shares_tenant_id_idx ON shares (tenant_id);

-- ── Spalten-Erweiterungen ─────────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN tenant_id uuid REFERENCES tenants(id);
ALTER TABLE projects ADD COLUMN routes jsonb NOT NULL DEFAULT '[]';

ALTER TABLE findings ADD COLUMN route_id text;
ALTER TABLE findings ADD COLUMN route_name text;

ALTER TABLE obstacles ADD COLUMN fach_id text;
ALTER TABLE obstacles ADD COLUMN quellen_id text;
ALTER TABLE obstacles ADD COLUMN realer_start date;

-- ── Daten-Migration: Default-Tenant + Member-Seed ─────────────────────────────

INSERT INTO tenants (slug, name) VALUES ('setreo', 'Setreo')
  ON CONFLICT (slug) DO NOTHING;

UPDATE projects SET tenant_id = (SELECT id FROM tenants WHERE slug = 'setreo')
  WHERE tenant_id IS NULL;

ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX projects_tenant_id_idx ON projects (tenant_id);

INSERT INTO tenant_members (tenant_id, email)
  SELECT id, 'vki@setreo.de' FROM tenants WHERE slug = 'setreo'
  ON CONFLICT (email) DO NOTHING;

-- ── Daten-Migration: route_input/route_geometry → routes[] ───────────────────
-- Aus Alt-Daten EINE Route bauen: Punkte aus route_geometry (Analyse-Ergebnis),
-- sonst route_input.points (Upload). Keine Punkte → routes bleibt [].

UPDATE projects p
SET routes = CASE
  WHEN s.pts IS NULL THEN '[]'::jsonb
  ELSE jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', COALESCE(
      s.file_name,
      CASE WHEN COALESCE(s.start_ort, '') <> '' AND COALESCE(s.ziel_ort, '') <> ''
           THEN s.start_ort || ' → ' || s.ziel_ort END,
      'Strecke 1'),
    'fileName', s.file_name,
    'points', s.pts,
    'farbe', '#87B52D')))
  END
FROM (
  SELECT id,
    route_input->>'fileName' AS file_name,
    route_input->>'start'    AS start_ort,
    route_input->>'ziel'     AS ziel_ort,
    CASE
      WHEN jsonb_typeof(route_geometry) = 'array'
       AND jsonb_array_length(route_geometry) >= 1 THEN route_geometry
      WHEN jsonb_typeof(route_input->'points') = 'array'
       AND jsonb_array_length(route_input->'points') >= 1 THEN route_input->'points'
    END AS pts
  FROM projects
) s
WHERE s.id = p.id;

ALTER TABLE projects DROP COLUMN route_input;
ALTER TABLE projects DROP COLUMN route_geometry;

-- ── Daten-Migration: transport-Umbau ──────────────────────────────────────────
-- achslasten = Array der Länge achsen, gefüllt mit dem alten achslast-Wert.
-- fahrzeugTyp / ladung / ladungsgewicht / achslast entfallen.

-- array_fill statt korreliertem jsonb_agg über generate_series (PG-Fehler 42803):
-- Länge = achsen, Wert = alter achslast-Wert; 0 Achsen → leeres Array.
UPDATE projects SET transport =
  (transport - 'fahrzeugTyp' - 'ladung' - 'ladungsgewicht' - 'achslast')
  || jsonb_build_object('achslasten',
    to_jsonb(array_fill(
      COALESCE((transport->>'achslast')::numeric, 0),
      ARRAY[GREATEST(COALESCE((transport->>'achsen')::numeric::int, 0), 0)]
    )));
