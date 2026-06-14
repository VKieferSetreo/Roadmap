-- Flag: Datensatz wurde automatisch aus Freitext angereichert (Regel-Extraktion, später LLM/Mac Studio).
-- Das FE zeigt damit ein Badge "mit KI-Aufbereitung". Default false; wird beim Ingest (makeNormalized →
-- extrahiert) und vom Batch-Enrichment gesetzt.
ALTER TABLE obstacles ADD COLUMN IF NOT EXISTS ki_aufbereitet boolean NOT NULL DEFAULT false;

-- Schnelles Filtern/Zählen der angereicherten Datensätze.
CREATE INDEX IF NOT EXISTS idx_obstacles_ki_aufbereitet ON obstacles (ki_aufbereitet) WHERE ki_aufbereitet;
