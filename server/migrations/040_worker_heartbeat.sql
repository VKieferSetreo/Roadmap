-- T-469: Dead-Man's-Switch für den Worker. Singleton-Zeile, die der Worker periodisch
-- aktualisiert; /api/health surfacet Staleness, sodass Monitoring einen toten/hängenden
-- Worker erkennt (er hat keinen HTTP-Port und sein einziges Lebenszeichen war eine Log-Zeile).
CREATE TABLE IF NOT EXISTS worker_heartbeat (
  id        int PRIMARY KEY DEFAULT 1,
  last_beat timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO worker_heartbeat (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
