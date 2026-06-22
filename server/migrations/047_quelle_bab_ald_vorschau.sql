-- 047 — Mobilithek-Abo BAB AlD: Arbeitsstellen längerer Dauer auf BAB, DATEX II V2.
-- Datenanbieter: Die Autobahn GmbH des Bundes. Subscription 1005520210240434176, clientPullService.
-- FK-Anker für den dedizierten Connector 0152 (statisch, NICHT env-getrieben — er filtert auf das
-- Zukunftsdelta und dedupt gegen 0001/0145; siehe 0152_bab_ald_vorschau.js).
-- abruf_intervall 1×/Tag: der Feed ist ~177 MB, Planungsdaten ändern sich langsam.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0152', 'BAB — Arbeitsstellen längerer Dauer, Vorschau (Autobahn GmbH, Mobilithek)', 'api', 'T1', 'amtlich', '0 5 * * *')
ON CONFLICT (id) DO NOTHING;
