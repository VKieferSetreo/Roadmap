-- 049 — Quelle 0154: LSBB Sachsen-Anhalt Fahrauflagen GST-Kran-Routennetz.
-- Research-Fund T-551. Offener ArcGIS-MapServer (DL-DE/BY-2.0), 9 Krangewichtsklassen-Layer.
-- FK-Anker für den statischen Connector 0154_lsbb_st_fahrauflagen.js.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0154', 'LSBB Sachsen-Anhalt — Fahrauflagen GST-Kran-Routennetz', 'api', 'T1', 'amtlich', '0 5 * * *')
ON CONFLICT (id) DO NOTHING;
