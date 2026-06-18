-- 035 — Berlin Durchfahrtshöhen (T-122): GDI-BE Straßenbefahrung-WFS, erstes echtes
-- Landes-Höhenkataster (fahrstreifenscharfe lichte Durchfahrtshöhen). dl-de/zero-2.0.
-- FK-Anker für import_runs/Connector 0133. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0133', 'Berlin — Durchfahrtshöhen (Straßenbefahrung, GDI-BE)', 'api', 'T1', 'amtlich', '0 7 * * 1')
ON CONFLICT (id) DO NOTHING;
