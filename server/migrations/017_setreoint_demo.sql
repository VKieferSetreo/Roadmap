-- 017 — Demo-Projekt Oberkirch -> Karlsruhe auch fuer den zweiten Setreo-Mandanten
-- 'Setreo Intern' (slug 'setreoint'). Strecke 1:1 vom 'setreo'-Mandanten kopiert
-- (gleiche routes/transport/zeitraum/geometry). Idempotent; im UI loeschbar.

-- 1) Tenant sicherstellen (existiert i.d.R. schon via Admin-UI; auf frischen DBs anlegen).
INSERT INTO tenants (slug, name)
SELECT 'setreoint', 'Setreo Intern'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'setreoint');

-- 2) Projekt 1:1 von 'setreo' nach 'setreoint' kopieren (nur wenn dort noch nicht vorhanden).
INSERT INTO projects (
  name, status, tenant_id, routes, transport, zeitraum,
  distanz_km, fahrzeit_min, created_by
)
SELECT
  src.name, src.status, ti.id, src.routes, src.transport, src.zeitraum,
  src.distanz_km, src.fahrzeit_min, src.created_by
FROM projects src
JOIN tenants ts ON ts.id = src.tenant_id AND ts.slug = 'setreo'
JOIN tenants ti ON ti.slug = 'setreoint'
WHERE src.name = 'Demo Schwertransport (Oberkirch -> Karlsruhe)'
  AND NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.tenant_id = ti.id AND p.name = src.name
  );
