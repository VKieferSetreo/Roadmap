-- 046 — Mobilithek-Abo Schleswig-Holstein: Brückensperrungen (Brückenzustände), DATEX II V2.
-- Datenanbieter: Landesbetrieb Straßenbau und Verkehr SH (LBV.SH). Subscription 1004800613941997568,
-- Container-Endpoint. FK-Anker für den env-getriebenen mobilithek.js-Connector (MOBILITHEK_FEEDS).
-- Neue SH-Vollsperrungs-Abdeckung an Brücken (roadClosed); suspended-Sätze filtert parseDatex2 weg.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0151', 'Schleswig-Holstein — Brückensperrungen (LBV.SH, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
