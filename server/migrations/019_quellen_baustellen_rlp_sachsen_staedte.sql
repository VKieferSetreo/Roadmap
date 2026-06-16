-- 019 — Neue freie Baustellen-Quellen (T-092): RLP + Sachsen (landesweit) + 5 Städte.
-- FK-Anker für import_runs/Connectoren. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0129', 'Mobilitätsatlas RLP — Baustellen (MWVLW Rheinland-Pfalz)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0130', 'Baustelleninformationssystem Sachsen (LASuV)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0224', 'Ingolstadt — Baustellen (open.bydata.de)', 'api', 'T4', 'amtlich', '0 6,12,18 * * *'),
  ('0225', 'Osnabrück — Baustellen (geo.osnabrueck.de)', 'api', 'T4', 'amtlich', '0 8,12,18 * * *'),
  ('0226', 'Freiburg — Baustellen (FreiGIS)', 'api', 'T4', 'amtlich', '0 8,12,18 * * *'),
  ('0227', 'Heidelberg — Baustellen (Open Data Heidelberg)', 'api', 'T4', 'amtlich', '0 8,12,18 * * *'),
  ('0228', 'Duisburg — Baustellen (Verkehrsportal)', 'api', 'T4', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
