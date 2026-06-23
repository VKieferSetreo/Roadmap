-- 051 — Quelle 0156: ViP.NRW Baustellen/Sperrungen (Verkehrsinformationsportal NRW, GeoServer WFS).
-- T-562. Offener GeoServer-Workspace vipnrw (verkehr.nrw/karte), vom Land NRW freigegeben.
-- FK-Anker für 0156_vipnrw_baustellen.js (sonst scheitert der import_runs-FK still).
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0156', 'ViP.NRW — Baustellen/Sperrungen innerorts (verkehr.nrw)', 'api', 'T4', 'amtlich', '0 7,13 * * *')
ON CONFLICT (id) DO NOTHING;
