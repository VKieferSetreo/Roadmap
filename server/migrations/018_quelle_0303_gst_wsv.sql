-- 018 — Quelle 0303: GST-WSV Brückenanlagen über Bundeswasserstraßen (WSV, bundesweit).
-- FK-Anker für import_runs/Connector 0303. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0303', 'GST-WSV — Brückenanlagen über Bundeswasserstraßen (WSV)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
