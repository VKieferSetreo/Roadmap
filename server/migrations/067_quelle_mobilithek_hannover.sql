-- 067 — Neues Mobilithek-Angebot: Landeshauptstadt Hannover, Baustellen und
-- Verkehrsmeldungen für die LMS/VMZ Niedersachsen (Abo 1003684941962907648,
-- abonniert 16.06.2026, DATEX II V2, Pull über mTLS).
--
-- Ohne diese Zeile schlägt import_runs_quelle_id_fkey bei jedem Lauf fehl und der
-- Import bleibt STILL aus (Lehre aus 039/Bayern und 055/RLP+NRW).
--
-- Abgrenzung zu den beiden vorhandenen Niedersachsen-Quellen:
--   0140 NLStBV — Baustellen B/L im klassifizierten Netz (Land, TMC-codiert)
--   0158 VMZ Niedersachsen — innerörtlich/kommunal aus dem offenen GeoJSON
--   0159 (hier) — die Meldungen der STADT Hannover, die in die LMS/VMZ einfließen
-- Ob es Überschneidungen mit 0158 gibt, lässt sich erst sagen, wenn der Feed Daten
-- führt: beim Anbinden am 19.08.2026 lieferte er eine gültige, aber LEERE
-- SituationPublication (HTTP 200, „DE-MDM-Stadt Hannover", null Datensätze).
--
-- lizenz_status bleibt auf dem sicheren Default 'open': die Mobilithek weist
-- „Lizenz, eingeschränkte Nutzung, kostenfrei" aus, die Abo-Seite zugleich „keine
-- Lizenz spezifiziert". Kein explizites Verbot (dann wäre es 'intern'), aber auch
-- keine belegte kommerzielle Freigabe (dann wäre es 'ready') — offen bis zur
-- Klärung mit dem Anbieter.
INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0159', 'Hannover — Baustellen/Verkehrsmeldungen (LH Hannover für LMS/VMZ NI, Mobilithek)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
