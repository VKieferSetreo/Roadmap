-- 053 — Quelle 0230: Köln LKW-Streckeninfo (Geoportal Stadt Köln, ArcGIS). T-563.
-- Brücken-Tragfähigkeit + Durchfahrtshöhe + sonstige LKW-Beschränkungen. FK-Anker für 0230_koeln_lkw_streckeninfo.js.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0230', 'Köln — LKW-Streckeninfo (Brücken-Tonnage/Durchfahrtshöhe)', 'api', 'T4', 'amtlich', '0 6 * * *')
ON CONFLICT (id) DO NOTHING;
