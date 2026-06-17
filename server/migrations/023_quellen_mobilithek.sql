-- 023 — Mobilithek-Abos (DATEX-II via mTLS-Pull), scharfgeschaltet 2026-06-17.
-- FK-Anker für die env-getriebenen mobilithek.js-Connectoren (MOBILITHEK_FEEDS). Idempotent.
-- 0140 (Niedersachsen) bewusst NICHT angelegt: NI liefert nur ALERT-C/TMC ohne Koordinaten
-- (bräuchte BASt-LCL-Tabelle) → wird erst gewireld, wenn die TMC-Auflösung steht.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0141', 'Hessen — Baustellen/Sperrungen (Hessen Mobil, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0142', 'Bremen — Baustellen/Sperrungen (VMZ Bremen, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0143', 'Brandenburg — Baustellen (GS Verkehrstechnik, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0144', 'Karlsruhe — Baustellen/Veranstaltungen (Tiefbauamt, Mobilithek)', 'api', 'T2', 'amtlich', '0 8,12,18 * * *'),
  ('0145', 'BAB — Arbeitsstellen kürzerer Dauer Planung (Autobahn GmbH, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
