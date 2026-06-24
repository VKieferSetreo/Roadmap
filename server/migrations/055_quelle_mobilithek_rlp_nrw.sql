-- Quellen-Registry für zwei neue Mobilithek-Feeds (dynamisch via MOBILITHEK_FEEDS aktiviert).
-- Ohne diese Zeilen schlägt import_runs_quelle_id_fkey bei jedem Lauf fehl → still kein Import
-- (siehe 039 Bayern 0147). Beide DATEX II V2, mit Koordinaten (live verifiziert, kein TMC).
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0148', 'Rheinland-Pfalz — Arbeitsstellen klassifiziertes Netz (LBM RLP, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0149', 'Nordrhein-Westfalen — Arbeitsstellen nachgeordnetes Netz (Straßen.NRW/LVZ.NRW, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
