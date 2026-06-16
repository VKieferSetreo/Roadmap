-- 020 — Freie landesweite Baustellen-Quellen (T-093): Thüringen (TLBV BIS) + Brandenburg (GDI-BB).
-- Beide frei direkt ziehbar (dl-de/by) → machen die jeweiligen Mobilithek-Abos überflüssig.
-- FK-Anker für import_runs/Connectoren. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0131', 'Thüringen — Baustellen/Sperrungen (TLBV BIS)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *'),
  ('0132', 'Brandenburg — Baustellen (Landesbetrieb Straßenwesen)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
