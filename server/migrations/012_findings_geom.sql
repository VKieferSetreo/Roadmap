-- 012 — findings.geom: GeoJSON-Geometrie (LineString/MultiLineString = Strecke) je Fund, damit das FE
-- die betroffene Strecke als Linie zeichnen kann (statt nur einen Punkt). Kommt aus obstacles.geom über
-- die Analyse-Engine. NULL = nur Punkt (lat/lng). Additive Spalte, kein Constraint → unkritisch beim Boot.
ALTER TABLE findings ADD COLUMN IF NOT EXISTS geom jsonb;
