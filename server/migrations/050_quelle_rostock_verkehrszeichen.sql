-- 050 — Quelle 0155: Rostock Verkehrszeichen-Kataster (GST-Beschränkungszeichen 262-266).
-- Research-Fund T-556. OpenData.HRO (CC0), GeoJSON. FK-Anker für 0155_rostock_verkehrszeichen.js.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0155', 'Rostock — Verkehrszeichen-Kataster (GST-Beschränkungen)', 'api', 'T4', 'amtlich', '0 6 * * *')
ON CONFLICT (id) DO NOTHING;
