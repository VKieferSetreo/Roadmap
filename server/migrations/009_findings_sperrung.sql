-- 009 — findings.kategorie um 'sperrung' (und vollen v1.0-Satz) erweitern.
--
-- Migration 006 hat 'sperrung' nur zur obstacles-Kategorie-CHECK ergänzt; die
-- findings-Tabelle behielt ihre 001-CHECK ohne 'sperrung'. Sobald die Engine einen
-- Sperrung-Fund schreibt (z.B. A7-Closure im Korridor), schlug der findings-INSERT
-- fehl (23514) → die GANZE Analyse-Transaktion brach ab → 502 "Analyse fehlgeschlagen".
--
-- Neue Liste = Superset der alten (nur 'sperrung' kommt dazu) → kein Konflikt mit
-- Bestands-Funden. Läuft transaktional über migrate.js (idempotent via _migrations).

ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_kategorie_check;

ALTER TABLE findings ADD CONSTRAINT findings_kategorie_check CHECK (kategorie IN
  ('bruecke', 'engstelle', 'baustelle', 'sperrung', 'gewicht', 'bahnuebergang',
   'kreisverkehr', 'ampel', 'steigung', 'tunnel'));
