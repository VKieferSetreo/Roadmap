-- 052 — Quelle 0157: SEVAS NRW LKW-/GST-Restriktionskataster (IT.NRW, Servicestelle Verkehrsdaten).
-- T-563. Offenes WFS (sevas.nrw.de/osm/sevas), amtlich. Durchfahrtshöhe/Gewicht/Breite/Länge/Achslast.
-- FK-Anker für 0157_sevas_nrw_restriktionen.js.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0157', 'SEVAS NRW — LKW-/GST-Restriktionen (IT.NRW)', 'api', 'T4', 'amtlich', '0 4 * * *')
ON CONFLICT (id) DO NOTHING;
