-- Quelle 0147 (Bayern, Mobilithek) wurde 2026-06-18 als dynamischer Connector (allConnectors aus
-- env) live geschaltet, aber die quellen-Registry-Zeile fehlte → import_runs_quelle_id_fkey schlug
-- bei JEDEM 0147-Lauf fehl (Bayern importierte nie). Nachgezogen analog 023/026 (Mobilithek-Feeds).
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0147', 'Bayern — Baustellenmeldungen (Bayerische Straßenbauverwaltung, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
