-- 026 — Mobilithek-Abo Thüringen: Arbeitsstellen längerer Dauer (ohne BAB), DATEX II V2.
-- Datenanbieter: Thüringer Landesamt für Bau und Verkehr (TLBV). Subscription 1003685577844559872.
-- FK-Anker für den env-getriebenen mobilithek.js-Connector (MOBILITHEK_FEEDS). Idempotent.
-- Ergänzt 0131 (TLBV-BIS RPI_GI-POST) um die längerfristigen Baustellen via Mobilithek/DATEX.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0146', 'Thüringen — Arbeitsstellen längerer Dauer ohne BAB (TLBV, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
