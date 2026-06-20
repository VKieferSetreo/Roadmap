-- T-467: höchstens EINE laufende Auswertung je Projekt. Bestehende 'running'-Waisen
-- (Prozess-Crash mitten im Lauf) zuerst bereinigen, sonst scheitert der Unique-Index an
-- Duplikaten. Danach der Partial-Unique-Index als deklarativer Lock — ein zweiter
-- INSERT(running) wirft 23505, den runAnalysis als 409 mappt.
UPDATE analysis_runs SET status = 'error', error = 'reclaimed at migration 041', finished_at = now()
  WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS analysis_runs_one_running
  ON analysis_runs (project_id) WHERE status = 'running';

-- T-466: Optimistic-Lock-Token für projects. PATCH prüft die erwartete Version und
-- inkrementiert sie; ein veralteter Schreiber (zweiter Disponent) bekommt 409 statt
-- den frischeren Stand still zu überschreiben. DEFAULT 0 = alle Bestands-Rows konsistent.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;
