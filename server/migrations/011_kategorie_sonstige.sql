-- 011 — obstacles.kategorie um 'sonstige' erweitern.
-- Hamburg-Bauwerke (0111) liefert Stützbauwerke/Lärmschutzbauwerke/sonstige Bauwerke — reale Bauwerke,
-- aber keine GST-Routen-Hindernisse. Sie werden gespeichert (Vorgabe: NICHTS droppen) und erscheinen auf
-- der DB-Karte (per Kategorie-Filter ausblendbar), generieren aber KEINEN Routen-Fund
-- (engine/rules.js evaluate(): default → null). Ohne diese Kategorie verwarf validateObstacle sie still
-- (421 Skips je Lauf).
ALTER TABLE obstacles DROP CONSTRAINT IF EXISTS obstacles_kategorie_check;
ALTER TABLE obstacles ADD CONSTRAINT obstacles_kategorie_check CHECK (kategorie IN
  ('bruecke','engstelle','baustelle','sperrung','gewicht','bahnuebergang','kreisverkehr','ampel','steigung','tunnel','sonstige'));
