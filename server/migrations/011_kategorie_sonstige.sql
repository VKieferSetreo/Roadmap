-- 011 — obstacles.kategorie um 'sonstige' erweitern.
-- Hamburg-Bauwerke (0111) liefert Stützbauwerke/Lärmschutzbauwerke/sonstige Bauwerke — reale Bauwerke,
-- aber keine GST-Routen-Hindernisse. Sie werden gespeichert (Vorgabe: NICHTS droppen) und erscheinen auf
-- der DB-Karte (per Kategorie-Filter ausblendbar), generieren aber KEINEN Routen-Fund
-- (engine/rules.js evaluate(): default → null). Ohne diese Kategorie verwarf validateObstacle sie still
-- (421 Skips je Lauf).
-- NOT VALID: kein Voll-Tabellen-Scan beim Boot. Die obstacles-Tabelle ist auf Prod
-- inzwischen sehr groß (107 Roads + „nichts droppen"); ein validierendes ADD CONSTRAINT
-- hielt beim migrate-on-boot einen ACCESS-EXCLUSIVE-Lock + Scan zu lange → die API kam
-- nicht hoch → Healthcheck-Timeout → Deploy-Rollback. NOT VALID nimmt nur einen kurzen
-- Lock (Bestandsdaten werden nicht geprüft — als Superset ohnehin gültig; nur neue/
-- geänderte Zeilen werden geprüft).
ALTER TABLE obstacles DROP CONSTRAINT IF EXISTS obstacles_kategorie_check;
ALTER TABLE obstacles ADD CONSTRAINT obstacles_kategorie_check CHECK (kategorie IN
  ('bruecke','engstelle','baustelle','sperrung','gewicht','bahnuebergang','kreisverkehr','ampel','steigung','tunnel','sonstige'))
  NOT VALID;
