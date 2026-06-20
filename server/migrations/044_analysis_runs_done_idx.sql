-- T-368: Hot-Dashboard (GET /api/stats) liest max(finished_at) je Mandant über
-- analysis_runs JOIN projects WHERE status='done'. analysis_runs wächst per-Projekt-
-- per-Rerun unbegrenzt; der bestehende analysis_runs_project_id_idx deckt weder den
-- status-Filter noch finished_at → Seq-Scan + Heap-Fetch pro Lauf.
--
-- Partial-Covering-Index: WHERE status='done' hält den Index klein (laufende/error-Runs
-- raus), (project_id, finished_at) deckt JOIN-Key + Aggregat → Index-Only max() je Projekt.
-- Plain CREATE INDEX (kein CONCURRENTLY): der Migrations-Runner fährt jede Migration in
-- einer Transaktion (BEGIN/COMMIT), CONCURRENTLY ist dort verboten; kurzer Lock auf der
-- moderat großen Tabelle ist akzeptabel.
CREATE INDEX IF NOT EXISTS analysis_runs_done_finished_idx
  ON analysis_runs (project_id, finished_at)
  WHERE status = 'done';
