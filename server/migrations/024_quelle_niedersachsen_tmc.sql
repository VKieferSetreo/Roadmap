-- 024 — Niedersachsen-Baustellen (NLStBV, Mobilithek), scharfgeschaltet 2026-06-17.
-- NI liefert ALERT-C/TMC-Location-Codes statt Koordinaten → über die BASt-LCL (tmc_de.json,
-- aus LCL22) geocodiert (Connector-Feed-Flag tmc:true). FK-Anker für den mobilithek.js-Feed 0140.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0140', 'Niedersachsen — Baustellen B/L Planung (NLStBV, Mobilithek/TMC)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
