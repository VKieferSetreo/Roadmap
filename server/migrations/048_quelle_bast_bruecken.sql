-- 048 — Quelle 0153: BASt Brückenstatistik Deutschland (schwerverkehrsgesperrte Brücken, bundesweit).
-- Research-Fund T-540. Offener ArcGIS-FeatureServer (CC BY 4.0), Layer Brueckenstatistik25.
-- FK-Anker für den statischen Connector 0153_bast_bruecken.js (sperrung_sv='ja', ~3294 Teilbauwerke).
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0153', 'BASt Brückenstatistik — schwerverkehrsgesperrte Brücken (bundesweit)', 'api', 'T1', 'amtlich', '0 4 * * *')
ON CONFLICT (id) DO NOTHING;
