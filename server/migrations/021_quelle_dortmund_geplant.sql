-- 021 — Quelle 0229: Dortmund GEPLANTE Baustellen (Open Data Dortmund, Opendatasoft).
-- Ergänzt 0216 (laufend) um Planungsdaten. FK-Anker. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0229', 'Dortmund — Geplante Baustellen (Open Data Dortmund)', 'api', 'T4', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
