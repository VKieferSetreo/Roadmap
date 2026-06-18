-- 036 — Hamburg Verkehrszeichen-Beschränkungen (T-123): geodienste.hamburg.de WFS.
-- Beschilderte Höhe (Z265), Gewicht (Z262) und Breite (Z264). Wert strukturiert im
-- vz_nr-Suffix, server-seitig OGC-gefiltert. dl-de/by-2.0. FK-Anker für Connector 0134.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0134', 'Hamburg — Verkehrszeichen-Beschränkungen (Höhe/Gewicht/Breite)', 'api', 'T1', 'amtlich', '0 7 * * 2')
ON CONFLICT (id) DO NOTHING;
